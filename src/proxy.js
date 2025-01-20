const http = require('http');
const net = require('net');
const httpProxy = require('http-proxy');
const CONFIG = require('./constant');
const { ensureVPNConnection, disconnectVPN, log, isAllowedSource } = require('./utils'); // 引入 VPN 连接检查函数

const args = process.argv.slice(2);

// Util functions
const isValidUrl = (target) => URL.canParse(target);
const getSocketIp = (socket) => socket.remoteAddress.replace(/^::ffff:/, ''); // 处理 IPv6 地址

// 核心逻辑
const main = async (autoDisconnectVPNOnSignal) => {

  // Proxy server daemon
  const setupProxyServer = async () => {
    try {
      // 连接 VPN
      await ensureVPNConnection();
      // 创建 HTTP 服务器
      const server = http.createServer(handleHttpRequest);
      server.on('connect', handleHttpsRequest);
      // 启动代理服务器
      server.listen(CONFIG.PROXY_PORT, CONFIG.LISTEN_ADDRESS, () => {
        log(`Proxy server listening on http://${CONFIG.LISTEN_ADDRESS}:${CONFIG.PROXY_PORT}`, 'proxy');
        log(`Allowed subnet: ${CONFIG.ALLOWED_SUBNET}`, 'proxy');
      });
      if (autoDisconnectVPNOnSignal) {
        handleVPNDisconnectOnSignal();
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

// 处理 HTTP 请求
const proxy = httpProxy.createProxyServer({});
const handleHttpRequest = (req, res) => {
  const clientIp = getSocketIp(req.socket);
  if (!isAllowedSource(clientIp)) {
    return sendForbiddenResponse(res, clientIp);
  }
  log(`New HTTP request from ${clientIp} to ${req.url}`);
  const targetUrl = new URL(req.url, `http://${req.headers.host}`);
  const target = `${targetUrl.protocol}//${targetUrl.hostname}:${targetUrl.port || 80}`;
  if (!isValidUrl(target)) {
    log(`Invalid target URL: ${target}`);
    return sendBadRequestResponse(res, target);
  }
  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    log(`HTTP Proxy Error: ${err.message}`);
    sendBadGatewayResponse(res, target);
  });
};

// 处理 HTTPS 请求的 CONNECT 隧道
const handleHttpsRequest = (req, clientSocket, head) => {
  const clientIp = getSocketIp(clientSocket);
  log(`New HTTPS request from ${clientIp} to ${req.url}`);

  if (!isAllowedSource(clientIp)) {
    return sendForbiddenResponseToClientSocket(clientSocket);
  }

  // 连接到目标服务器
  const { hostname, port } = new URL(`http://${req.url}`);
  const serverSocket = connectToServer(hostname, port, clientSocket, head);

  // 设置超时和错误处理
  handleSocketErrors(serverSocket, clientSocket);
  serverSocket.setTimeout(CONFIG.SOCKET_TIMEOUT, () => {
    log(`Connection to server ${getSocketIp(serverSocket)} timed out.`, 'info');
    clientSocket.end();
  });
};

// 连接到目标服务器
const connectToServer = (hostname, port, clientSocket, head) => {
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

  return serverSocket;
};

// Error handlers
const handleSocketErrors = (serverSocket, clientSocket) => {
  serverSocket.on('error', (err) => {
    if (err.code === 'ECONNABORTED') {
      log(`Connection aborted by server ${getSocketIp(serverSocket)}`, 'info');
    } else {
      log(`HTTPS proxy error: ${err.message}`, 'warning');
    }
    clientSocket.end();
  });

  // 捕获错误，防止崩溃
  clientSocket.on('error', (err) => {
    log(`Client socket error: ${err.message}`, 'warning');
  });
  serverSocket.on('error', (err) => {
    log(`Server socket error: ${err.message}`, 'warning');
  });
};

// Response handlers
const sendForbiddenResponseToClientSocket = (clientSocket) => {
  clientSocket.write(
    'HTTP/1.1 403 Forbidden\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n403 Forbidden: Access is restricted to allowed subnet'
  );
  clientSocket.destroy();
  log(`Blocked request from ${getSocketIp(clientSocket)}`, 'warning');
};

const sendForbiddenResponse = (res, clientIp) => {
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('403 Forbidden: Access is restricted to allowed subnet');
  log(`Blocked request from ${clientIp}`, 'warning');
};

const sendBadRequestResponse = (res, target) => {
  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.end(`400 Bad Request: Invalid target URL - ${target}`);
  log(`Bad request: ${target}`, 'warning');
};

const sendBadGatewayResponse = (res, target) => {
  res.writeHead(502);
  res.end('Bad Gateway');
  log(`Bad gateway: ${target}`, 'warning');
};

// Auto disconnect VPN
const handleVPNDisconnectOnSignal = () => {
  // 如果传入了 --auto-disconnect 参数，监听 SIGABRT 信号并自动断开 VPN
  process.on('SIGINT', async () => {
    log('Received SIGINT, disconnecting VPN...', 'proxy');
    try {
      await disconnectVPN();
      log(`VPN ${CONFIG.VPN_NAME} is disconnected.`, 'proxy');
    } catch (error) {
      log('Failed to disconnect VPN:', error.message, 'error');
    }
  });
};


// 启动代理服务器

const autoDisconnect = args.includes('--auto-disconnect');
const disableVerbose = args.includes('--disable-verbose');
CONFIG.VERBOSE = !disableVerbose;
if (CONFIG.VERBOSE) {
  log('Verbose mode enabled.', 'info');
}
log(`Auto disconnect: ${autoDisconnect}`, 'proxy');
main(autoDisconnect);
