// proxy.js
import http from 'http';
import net from 'net';
import httpProxy from 'http-proxy';
import { CONFIG } from '../constant.js';
import { ensureVPNConnection, disconnectVPN, parseRequestUrl, logger, isValidUrl, getSocketIp, isAllowedSource } from './utils.js';
import { sendForbiddenResponseToClientSocket, sendBadRequestResponseToClientSocket, sendForbiddenResponse, sendBadGatewayResponse, sendBadRequestResponse } from './error-handlers.js';

const log = logger(CONFIG.VERBOSE);

// http proxy request handler
const handleHttpRequest = (proxy) => {
  return (req, res) => {
    // 过滤不在允许范围内的请求
    const clientIp = getSocketIp(req.socket);
    if (!isAllowedSource(clientIp, CONFIG.ALLOWED_SUBNET)) {
      return sendForbiddenResponse(res, clientIp);
    }
    // 构建完整的 URL
    const host = req.headers.host;
    const fullUrl = `http://${host}${req.url}`;
    log(`New HTTP request from ${clientIp} to ${fullUrl}`);

    if (!host) {
      log('Host header is missing', 'warning');
      return sendBadRequestResponse(res, 'Host header is missing');
    }

    // 解析请求 URL
    if (URL.canParse(fullUrl)) {
      req.headers['x-forwarded-for'] = clientIp; // 传递原始客户端IP
      req.headers['via'] = 'local-proxy'; // 添加 Via 头
      const target = new URL(fullUrl);
      // 代理请求
      proxy.web(req, res, { target: target.origin, changeOrigin: true }, (err) => {
        log(`HTTP Proxy Error: ${err.message}`);
        sendBadGatewayResponse(res, target);
      });
    } else {
      log(`Invalid URL: ${fullUrl}`, 'warning');
      return sendBadRequestResponse(res, 'Invalid URL');
    }
  }
};

// https proxy request handler
const handleHttpsRequest = (req, clientSocket, head) => {
  // 过滤不在允许范围内的请求
  const clientIp = getSocketIp(clientSocket);
  if (!isAllowedSource(clientIp, CONFIG.ALLOWED_SUBNET)) {
    log(`Blocked request from ${clientIp}`, 'warning');
    return sendForbiddenResponseToClientSocket(clientSocket);
  }
  log(`New HTTPS request from ${clientIp} to ${req.url}`);
  // 解析请求 URL
  const [hostname, port = 443] = parseRequestUrl(req.url);
  if (!isValidUrl(hostname, port || 443)) {
    log(`Invalid target URL - hostname: ${hostname}, port:${port || 443}`);
    return sendBadRequestResponseToClientSocket(clientSocket);
  }
  // 连接到目标服务器
  const serverSocket = net.connect(port || 443, hostname, () => {
    clientSocket.write(
      'HTTP/1.1 200 Connection Established\r\n' +
      'Proxy-agent: Node.js-Proxy\r\n' +
      '\r\n'
    );
    serverSocket.write(head);
    // 双向数据转发
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });
  // 设置超时和错误处理
  serverSocket.on('error', (err) => {
    if (err.code === 'ECONNABORTED') {
      log(`Connection aborted by server ${getSocketIp(serverSocket)}`, 'info');
    } else if (err.code === 'ETIMEDOUT') {
      log(`Connection to server ${getSocketIp(serverSocket)} timed out.`, 'info');
    } else if (err.code === 'ECONNRESET') {
      log(`Connection reset by server ${getSocketIp(serverSocket)}`, 'info');
    } else if (err.code === 'ENETUNREACH') {
      log(`Network is unreachable to server ${getSocketIp(serverSocket)}`, 'warning');
    } else {
      log(`Server socket error: ${err.message}`, 'warning');
    }
    clientSocket.end();
  });
  // 捕获错误，防止崩溃
  clientSocket.on('error', (err) => {
    if (err.code === 'ECONNRESET') {
      log(`Connection reset by client ${getSocketIp(clientSocket)}`, 'info');
    } else if (err.code === 'ECONNABORTED') {
      log(`Connection aborted by client ${getSocketIp(clientSocket)}`, 'info');
    } else {
      log(`Client socket error: ${err.message}`, 'warning');
    }
  });
  serverSocket.setTimeout(CONFIG.SOCKET_TIMEOUT, () => {
    log(`Connection to server ${getSocketIp(serverSocket)} timed out.`, 'info');
    clientSocket.end();
  });
};

// 核心逻辑
const main = async () => {
  if (CONFIG.VERBOSE) {
    log('Verbose mode enabled.', 'info');
  }

  // 共享状态变量
  let server = null;
  let proxy = null;
  let isShuttingDown = false;
  let vpnCheckInterval = null;

  // 清理资源函数
  const cleanupResources = async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }
    if (proxy) {
      await new Promise((resolve) => proxy.close(resolve));
      proxy = null;
    }
    if (vpnCheckInterval) {
      clearInterval(vpnCheckInterval);
    }
  };

  // 信号处理函数
  const handleShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log(`Received ${signal}, cleaning up resources...`, 'proxy');

    try {
      await cleanupResources();
      if (CONFIG.AUTO_DISCONNECT_VPN_ON_SIGNAL) {
        await disconnectVPN();
        log(`VPN ${CONFIG.VPN_NAME} is disconnected.`, 'proxy');
      }
    } catch (error) {
      log(`Cleanup failed: ${error.message}`, 'error');
    } finally {
      process.exit(0);
    }
  };

  // 注册信号处理
  if (CONFIG.AUTO_DISCONNECT_VPN_ON_SIGNAL) {
    ['SIGINT', 'SIGTERM'].forEach(signal => {
      isShuttingDown = true;
      process.on(signal, () => handleShutdown(signal));
    });
  }

  // 代理服务器守护进程
  const setupProxyServer = async () => {
    try {
      // 确保VPN连接
      await ensureVPNConnection();
      // 清理之前的服务器实例
      await cleanupResources();
      // VPN状态检查
      vpnCheckInterval = setInterval(async () => {
        try {
          await ensureVPNConnection();
        } catch (error) {
          log(`VPN connection check failed: ${error.message}`, 'vpn');
        }
      }, CONFIG.VPN_CHECK_INTERVAL);
      // 创建新服务器
      proxy = httpProxy.createProxyServer({});
      server = http.createServer(handleHttpRequest(proxy));
      server.on('connect', handleHttpsRequest);
      server.on('error', (err) => {
        log(`Server error: ${err.message}`, 'error');
      });

      // 启动监听
      await new Promise((resolve, reject) => {
        server.listen(CONFIG.PROXY_PORT, CONFIG.LISTEN_ADDRESS, (err) => {
          if (err) return reject(err);
          log(`Proxy server listening on http://${CONFIG.LISTEN_ADDRESS}:${CONFIG.PROXY_PORT}`, 'proxy');
          log(`Allowed subnet: ${CONFIG.ALLOWED_SUBNET}`, 'proxy');
          resolve();
        });
      });

    } catch (error) {
      log(`Unhandled error: ${error.message}`, 'error');
      // 指数退避重试
      const retryCount = (setupProxyServer.retryCount || 0) + 1;
      const delay = Math.min(
        CONFIG.RESTART_TIMEOUT * (2 ** retryCount),
        CONFIG.MAX_RETRY_TIMEOUT
      );
      log(`Restarting server in ${delay}ms...`, 'proxy');
      setupProxyServer.retryCount = retryCount;
      setTimeout(setupProxyServer, delay);
    }
  };

  // 启动服务
  try {
    await setupProxyServer();
  } catch (error) {
    log(`Initial setup failed: ${error.message}`, 'error');
    await handleShutdown('INIT_ERROR');
  }
};

// 启动代理服务器
main()
