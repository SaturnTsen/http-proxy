// proxy.js
import http from 'http';
import net from 'net';
import httpProxy from 'http-proxy';
import { CONFIG } from '../constant.js';
import {
    logger,
    getClientSocketIp,
    isAllowedSource,
    parseRequestUrl,
    ensureVPNConnection,
} from './utils.js';
import {
    sendForbiddenResponse,
    sendBadGatewayResponse,
    sendBadRequestResponse,
    sendForbiddenResponseToClientSocket,
    sendBadGatewayResponseToClientSocket,
    sendBadRequestResponseToClientSocket,
} from './error-handlers.js';

const log = logger(CONFIG.VERBOSE);

// http proxy request handler
const handleRequest = (proxy) => {
    return (req, res) => {
        // 安全获取客户端IP（通过socket获取实际连接IP）
        const clientIp = getClientSocketIp(req.socket) || req.socket.remoteAddress;
        const host = req.headers.host;

        // 基础验证处理
        if (!host) {
            log('Host header is missing', 'warning');
            return sendBadRequestResponse(res, 'Host header is missing');
        }

        const fullUrl = new URL(req.url, `http://${host}`);
        log(`New HTTP request from ${clientIp} to ${fullUrl.href}`);

        // 请求源验证
        if (!isAllowedSource(clientIp, CONFIG.ALLOWED_SUBNET)) {
            log(`Blocked request from ${clientIp}`, 'warning');
            return sendForbiddenResponse(res, clientIp);
        }

        try {
            // RFC 7239 规范的 HTTP 头处理
            const existingForwarded = req.headers['forwarded'] || '';
            req.headers['forwarded'] = existingForwarded +
                `${existingForwarded ? ', ' : ''}for="${clientIp}";proto=http`;
            // 正确处理X-Forwarded-For（追加而非覆盖）
            const existingXff = req.headers['x-forwarded-for'] || '';
            req.headers['x-forwarded-for'] = existingXff
                ? `${existingXff}, ${clientIp}`
                : clientIp;
            // Via头需要符合RFC 2616规范 (格式: 1.1 hostname)
            const viaIdentifier = 'local-vm-proxy';
            req.headers['via'] = req.headers['via']
                ? `${req.headers['via']}, 1.1 ${viaIdentifier}`
                : `1.1 ${viaIdentifier}`;
            // 绑定错误处理
            proxy.on('error', (err, _req, _res) => {
                log(`Proxy error [${err.code}]: ${err.message}`, 'error');
                if (!_res.headersSent) {
                    sendBadGatewayResponse(_res, fullUrl.hostname);
                }
            });
            // 执行代理请求
            proxy.web(req, res, {
                target: fullUrl.origin,
                changeOrigin: true,
                headers: req.headers,
                // 防止重复设置headers
            });
        } catch (err) {
            log(`Request processing failed: ${err.message}`, 'error');
            sendBadGatewayResponse(res, fullUrl.hostname);
        }

    };
};

// https proxy request handler
const handleConnect = (req, clientSocket, head) => {
    // 过滤不在允许范围内的请求
    const clientIp = getClientSocketIp(clientSocket);
    log(`New HTTPS CONNECT from ${clientIp} to ${req.url}`);
    if (!isAllowedSource(clientIp, CONFIG.ALLOWED_SUBNET)) {
        log(`Blocked request from ${clientIp}`, 'warning');
        return sendForbiddenResponseToClientSocket(clientSocket);
    }
    // 解析请求 URL
    const [hostname, port = 443] = parseRequestUrl(req.url);
    if (!hostname || hostname.length === 0) {
        log(`Invalid request URL: ${req.url}`, 'warning');
        return sendBadRequestResponseToClientSocket(clientSocket, 'Invalid hostname');
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
            log(`Connection aborted by server ${hostname}:${port}`, 'info');
        } else if (err.code === 'ETIMEDOUT') {
            log(`Connection to server ${hostname}:${port} timed out.`, 'info');
        } else if (err.code === 'ECONNRESET') {
            log(`Connection reset by server ${hostname}:${port}`, 'info');
        } else if (err.code === 'ENETUNREACH') {
            log(`Network is unreachable to server ${hostname}:${port}`, 'info');
        } else {
            log(`UnclassifiedServer socket error: ${err.message}`, 'warning');
        }
        serverSocket.end();
    });
    // 捕获错误，防止崩溃
    clientSocket.on('error', (err) => {
        if (err.code === 'ECONNRESET') {
            log(`Connection reset by client ${clientIp}`, 'info');
        } else if (err.code === 'ECONNABORTED') {
            log(`Connection aborted by client ${clientIp}`, 'info');
        } else {
            log(`Unclassified Client socket error: ${err}`, 'warning');
        }
        sendBadGatewayResponseToClientSocket(clientSocket, `${hostname}:${port}`);
        clientSocket.end();
    });
    serverSocket.setTimeout(CONFIG.SOCKET_TIMEOUT, () => {
        log(`Connection to server ${hostname}:${port} timed out.`, 'info');
        clientSocket.end();
    });
};

// 核心逻辑
const main = async () => {
    if (CONFIG.VERBOSE) {
        log('Verbose mode enabled.', 'info');
    }
    // 确保VPN连接
    await ensureVPNConnection();
    // 创建新服务器
    let proxy = httpProxy.createProxyServer({});
    let server = http.createServer(handleRequest(proxy));
    server.on('connect', handleConnect);
    server.on('error', (err) => {
        log(`Unhandled Server error: ${err.message}`, 'error');
    });
    // 启动监听
    server.listen(CONFIG.PROXY_PORT, CONFIG.LISTEN_ADDRESS);
    log(`Proxy server listening on ${CONFIG.LISTEN_ADDRESS}:${CONFIG.PROXY_PORT}`, 'proxy');
    // 定时检查VPN连接
    setInterval(async () => {
        try {
            await ensureVPNConnection();
        } catch (error) {
            log(`VPN connection check failed: ${error.message}`, 'vpn');
        }
    }, CONFIG.VPN_CHECK_INTERVAL);
};

// 启动代理服务器
main()
