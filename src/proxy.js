const http = require('http');
const net = require('net');
const url = require('url');
const httpProxy = require('http-proxy');
const CONFIG = require('./constant');
const { checkVPNConnection, connectVPN, disconnectVPN } = require('./utils'); // 引入 VPN 连接检查函数

// 启动代理服务器
const main = async (autoDisconnect) => {
  try {
    await ensureVPNConnection();

    // 创建 HTTP 服务器
    const server = createServer();

    // 启动代理服务器
    server.listen(CONFIG.PROXY_PORT, CONFIG.LISTEN_ADDRESS, () => {
      log(`Proxy server listening on http://${CONFIG.LISTEN_ADDRESS}:${CONFIG.PROXY_PORT}`);
      log(`Allowed subnet: ${CONFIG.ALLOWED_SUBNET}`)
    });

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
  } catch (error) {
    log('Error caught: ', error.message);
    process.exit(1);
  }
};

// 创建一个 httpProxy 实例
const proxy = httpProxy.createProxyServer({});

// 创建统一的日志函数
const log = (message) => {
  console.log(`[Proxy] ${message}`);
};

// 检查请求来源是否属于允许的网段
const isAllowedSource = (ip) => ip.startsWith(CONFIG.ALLOWED_SUBNET);

// 检查 VPN 是否已连接，如果没有则连接
const ensureVPNConnection = async () => {
  const vpnStatus = await checkVPNConnection();
  if (vpnStatus === 'VPN is not connected.') {
    log(`Attempting to connect to VPN: ${CONFIG.VPN_NAME}...`);
    await connectVPN();
    log(`VPN ${CONFIG.VPN_NAME} is now connected!`);
  } else {
    log('VPN is already connected.');
  }
};

// 创建 HTTP 服务器
const createServer = () => {
  const server = http.createServer(handleHttpRequest);
  server.on('connect', handleHttpsRequest);
  return server;
};

// 处理 HTTP 请求
const handleHttpRequest = (req, res) => {
  const clientIp = getClientIp(req);

  // 检查来源是否允许
  if (!isAllowedSource(clientIp)) {
    return sendForbiddenResponse(res, clientIp);
  }

  const target = req.url;

  // 确保 target URL 是合法的
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
  const clientIp = clientSocket.remoteAddress.replace(/^::ffff:/, ''); // 获取客户端 IP 地址

  // 检查来源是否允许
  if (!isAllowedSource(clientIp)) {
    clientSocket.write(
      'HTTP/1.1 403 Forbidden\r\n' +
      'Content-Type: text/plain\r\n' +
      '\r\n403 Forbidden: Access is restricted to allowed subnet'
    );
    clientSocket.destroy();
    log(`Blocked CONNECT request from ${clientIp}`);
    return;
  }

  const { hostname, port } = url.parse(`http://${req.url}`);

  // 建立到目标服务器的 TCP 连接
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

  serverSocket.on('error', (err) => {
    log(`HTTPS Proxy Error: ${err.message}`);
    clientSocket.end();
  });
};

// 获取客户端的 IP 地址（处理 IPv6 地址）
const getClientIp = (req) => req.socket.remoteAddress.replace(/^::ffff:/, '');

// 检查 URL 是否有效
const isValidUrl = (target) => {
  try {
    new URL(target); // 如果 target 不是有效的 URL，这里会抛出异常
    return true;
  } catch (err) {
    return false;
  }
};

// 发送 403 Forbidden 响应
const sendForbiddenResponse = (res, clientIp) => {
  res.writeHead(403, { 'Content-Type': 'text/plain' });
  res.end('403 Forbidden: Access is restricted to allowed subnet');
  log(`Blocked request from ${clientIp}`);
};

// 发送 400 Bad Request 响应
const sendBadRequestResponse = (res, target) => {
  res.writeHead(400, { 'Content-Type': 'text/plain' });
  res.end(`400 Bad Request: Invalid target URL - ${target}`);
};

// 发送 502 Bad Gateway 响应
const sendBadGatewayResponse = (res) => {
  res.writeHead(502);
  res.end('Bad Gateway');
};


// 启动代理服务器
const args = process.argv.slice(2);
const autoDisconnect = args.includes('--auto-disconnect');
console.log('[Proxy] Auto disconnect:', autoDisconnect);
main(autoDisconnect);
