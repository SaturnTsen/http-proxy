// proxy.js
import http from 'http';
import net from 'net';
import httpProxy from 'http-proxy';
import CONFIG from './constant.js';
import { ensureVPNConnection, disconnectVPN, parseRequestUrl, log, isValidUrl, getSocketIp, isAllowedSource } from './utils.js';

const proxy = httpProxy.createProxyServer({});

// Https error handlers
const sendForbiddenResponseToClientSocket = (clientSocket) => {
  clientSocket.write(
    'HTTP/1.1 403 Forbidden\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n403 Forbidden: Access is restricted to allowed subnet'
  );
  clientSocket.destroy();
  log(`Blocked request from ${getSocketIp(clientSocket)}`, 'warning');
};

const sendBadRequestResponseToClientSocket = (clientSocket) => {
  clientSocket.write(
    'HTTP/1.1 400 Bad Request\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n400 Bad Request: Invalid target URL'
  );
  clientSocket.destroy();
}


// http error handlers
const sendForbiddenResponse = (res, clientIp) => {
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('403 Forbidden: Access is restricted to allowed subnet');
  log(`Blocked request from ${clientIp}`, 'warning');
};

const sendBadGatewayResponse = (res, target) => {
  res.writeHead(502);
  res.end('Bad Gateway');
  log(`Bad gateway: ${target}`, 'warning');
};

const sendBadRequestResponse = (res, message) => {
  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.end(`400 Bad Request: ${message}`);
};

// http proxy request handler
const handleHttpRequest = (req, res) => {
  // 过滤不在允许范围内的请求
  const clientIp = getSocketIp(req.socket);
  if (!isAllowedSource(clientIp, CONFIG.ALLOWED_SUBNET)) {
    return sendForbiddenResponse(res, clientIp);
  }
  log(`New HTTP request from ${clientIp} to ${req.url}`);
  // 从请求头中获取主机信息
  const host = req.headers.host;
  if (!host) {
    return sendBadRequestResponse(res, 'Host header is missing');
  }
  // 构建完整的 URL
  const fullUrl = `http://${host}${req.url}`;
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
    return sendBadRequestResponse(res, 'Invalid URL');
  }
};

// https proxy request handler
const handleHttpsRequest = (req, clientSocket, head) => {
  // 过滤不在允许范围内的请求
  const clientIp = getSocketIp(clientSocket);
  if (!isAllowedSource(clientIp, CONFIG.ALLOWED_SUBNET)) {
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
const main = async (autoDisconnectVPNOnSignal) => {
  // Proxy server daemon
  const setupProxyServer = async () => {
    try {
      // 连接 VPN
      await ensureVPNConnection();
      // Server callback functions
      const server = http.createServer(handleHttpRequest); // http 代理
      server.on('connect', handleHttpsRequest); // https 代理
      // Listen on specified port and address
      server.listen(CONFIG.PROXY_PORT, CONFIG.LISTEN_ADDRESS, () => {
        log(`Proxy server listening on http://${CONFIG.LISTEN_ADDRESS}:${CONFIG.PROXY_PORT}`, 'proxy');
        log(`Allowed subnet: ${CONFIG.ALLOWED_SUBNET}`, 'proxy');
      });

      // 如果传入了 --auto-disconnect 参数，监听 SIGABRT 信号并自动断开 VPN
      if (autoDisconnectVPNOnSignal) {
        process.on('SIGINT', async () => {
          log('Received SIGINT, disconnecting VPN...', 'proxy');
          try {
            await disconnectVPN();
            log(`VPN ${CONFIG.VPN_NAME} is disconnected.`, 'proxy');
          } catch (error) {
            log('Failed to disconnect VPN:', error.message, 'error');
          }
        });
      }

    } catch (error) {
      log(error.message, 'error');
      log('Unhandled error occurred, restarting server...', 'proxy');
      // Auto restart when error occurs
      setTimeout(setupProxyServer, CONFIG.RESTART_TIMEOUT);
    }
  };

  // VPN state checker
  setInterval(async () => {
    try {
      await ensureVPNConnection();
    } catch (error) {
      log(`Error in VPN connection check: ${error.message}`, 'vpn');
    }
  }, CONFIG.VPN_CHECK_INTERVAL);

  setupProxyServer();
};


// 启动代理服务器
const args = process.argv.slice(2);
const autoDisconnect = args.includes('--auto-disconnect');
const disableVerbose = args.includes('--disable-verbose');
CONFIG.VERBOSE = !disableVerbose;
if (CONFIG.VERBOSE) {
  log('Verbose mode enabled.', 'info');
}
log(`Auto disconnect: ${autoDisconnect}`, 'proxy');
main(autoDisconnect);
