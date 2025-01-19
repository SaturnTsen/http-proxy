const http = require('http');
const net = require('net');
const url = require('url');
const httpProxy = require('http-proxy');
const CONFIG = require('./constant');
const { ensureVPNConnection, disconnectVPN, log, logInfo } = require('./utils'); // 引入 VPN 连接检查函数

const args = process.argv.slice(2);

// Util functions
const isAllowedSource = (ip) => ip.startsWith(CONFIG.ALLOWED_SUBNET); // 检查请求来源是否属于允许的网段
const getClientIp = (req) => req.socket.remoteAddress.replace(/^::ffff:/, ''); // 处理 IPv6 地址
const getClientIpConnect = (clientSocket) => clientSocket.remoteAddress.replace(/^::ffff:/, ''); // 处理 IPv6 地址
const isValidUrl = (target) => { try { new URL(target); return true; } catch (err) { return false; } };

// 核心逻辑
const proxy = httpProxy.createProxyServer({});
const main = async (autoDisconnect) => {
  try { 
    // 连接 VPN
    await ensureVPNConnection();
    // 创建 HTTP 服务器
    const server = http.createServer(handleHttpRequest);  
    server.on('connect', handleHttpsRequest);
    // 启动代理服务器
    server.listen(CONFIG.PROXY_PORT, CONFIG.LISTEN_ADDRESS, () => {
      log(`Proxy server listening on http://${CONFIG.LISTEN_ADDRESS}:${CONFIG.PROXY_PORT}`);
      log(`Allowed subnet: ${CONFIG.ALLOWED_SUBNET}`);
    });
    handleAutoDisconnect(autoDisconnect); // 处理自动断开 VPN
  } catch (error) {
    log('Error caught: ', error.message);
    process.exit(1);
  }
};


// 处理 HTTP 请求
const handleHttpRequest = (req, res) => {
  const clientIp = getClientIp(req);

  if (!isAllowedSource(clientIp)) {
    return sendForbiddenResponse(res, clientIp);
  }
  logInfo(`New HTTP request from ${clientIp} to ${req.url}`);

  const target = req.url;
  if (!isValidUrl(target)) {
    log(`Invalid target URL: ${target}`);
    return sendBadRequestResponse(res, target);
  }

  proxy.web(req, res, { target, changeOrigin: true }, (err) => {
    log(`HTTP Proxy Error: ${err.message}`);
    sendBadGatewayResponse(res);
  });
};

// 处理 HTTPS 请求的 CONNECT 隧道
const handleHttpsRequest = (req, clientSocket, head) => {
  const clientIp = getClientIpConnect(clientSocket);
  logInfo(`New HTTPS request from ${clientIp} to ${req.url}`);

  if (!isAllowedSource(clientIp)) {
    return sendForbiddenResponseToClientSocket(clientSocket);
  }

  // 连接到目标服务器
  const { hostname, port } = new URL(`http://${req.url}`);
  const serverSocket = connectToServer(hostname, port, clientSocket, head);

  // 设置超时和错误处理
  handleSocketErrors(serverSocket, clientSocket);
  serverSocket.setTimeout(10000, () => {
    log('Connection to server timed out.');
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
      log('Connection aborted by server.');
    } else {
      log(`HTTPS Proxy Error: ${err.message}`);
    }
    clientSocket.end();
  });

  // 捕获错误，防止崩溃
  clientSocket.on('error', (err) => {
    log(`Client socket error: ${err.message}`);
  });
  serverSocket.on('error', (err) => {
    log(`Server socket error: ${err.message}`);
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
};

const sendForbiddenResponse = (res, clientIp) => {
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('403 Forbidden: Access is restricted to allowed subnet');
  log(`Blocked request from ${clientIp}`);
};

const sendBadRequestResponse = (res, target) => {
  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.
  end(`400 Bad Request: Invalid target URL - ${target}`);
};

const sendBadGatewayResponse = (res) => {
  res.writeHead(502);
  res.end('Bad Gateway');
};

// Auto disconnect VPN
const autoDisconnect = args.includes('--auto-disconnect');
const handleAutoDisconnect = (autoDisconnect) => {
  // 如果传入了 --auto-disconnect 参数，监听 SIGABRT 信号并自动断开 VPN
  if (autoDisconnect) {
    process.on('SIGINT', async () => {
      log('Received SIGABRT, disconnecting VPN...');
      try {
        await disconnectVPN();
        log(`VPN ${CONFIG.VPN_NAME} is disconnected.`);
      } catch (error) {
        log('Failed to disconnect VPN:', error.message);
      }
    });
  }
};


// 启动代理服务器

console.log('[Proxy] Auto disconnect:', autoDisconnect);
main(autoDisconnect);
