import http from 'http';
import httpProxy from 'http-proxy';
import net from 'net';
import { JUMPSERVER_CONFIG } from '../constant.js';
import {
    getClientSocketIp,
    isAllowedSource,
    logger,
    parseRequestUrl
} from './utils.js';
import {
    sendBadGatewayResponse,
    sendForbiddenResponse,
    sendBadRequestResponseToClientSocket,
    sendForbiddenResponseToClientSocket,
    sendBadGatewayResponseToClientSocket
} from './error-handlers.js';
const log = logger(JUMPSERVER_CONFIG.VERBOSE);

const handleRequest = (proxy) => {
    return (req, res) => {
        // 真实客户端IP提取（兼容IPv6映射格式）
        const clientIp = getClientSocketIp(req.socket);
        log(`New HTTP request from ${clientIp} to ${req.url}`, 'info');
        // Phase 1: 前置安全验证
        if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
            return sendForbiddenResponse(res, 'Access is restricted to allowed subnet');
        }
        try {
            // Phase 2: 构建可信X-Forwarded-For链
            const existingXff = req.headers['x-forwarded-for'] || '';
            req.headers['x-forwarded-for'] = existingXff
                ? `${existingXff}, ${clientIp}`
                : clientIp;
            // Via头需要符合RFC 2616规范 (格式: 1.1 hostname)
            const viaIdentifier = 'jump-proxy';
            req.headers['via'] = req.headers['via']
                ? `${req.headers['via']}, 1.1 ${viaIdentifier}`
                : `1.1 ${viaIdentifier}`;
            // Phase 3: 流量中转（带有透明错误处理）
            const proxyTarget = `http://${JUMPSERVER_CONFIG.TARGET_PROXY.host}:${JUMPSERVER_CONFIG.TARGET_PROXY.port}`;
            proxy.on('error', (err, req, res) => {
                log(`HTTP Proxy Error: ${err}`, 'info');
                sendBadGatewayResponse(res, req.url);
            });
            proxy.web(req, res, { target: proxyTarget, headers: req.headers })
        } catch (err) {
            log(`Error: ${err}`, 'error');
            sendBadGatewayResponse(res, req.url);
        }
    }
};

// 处理CONNECT方法 (HTTPS隧道)
// listener: (req: http.IncomingMessage, socket: internal.Duplex, head: Buffer)
/**
 * Handles HTTPS CONNECT requests.
 * @param {http.IncomingMessage} req - The incoming HTTP request.
 * @param {net.Socket} clientSocket - The client socket.
 */
const handleConnect = (req, clientSocket) => {
    const clientIp = getClientSocketIp(clientSocket);
    if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
        return sendForbiddenResponseToClientSocket(clientSocket);
    }
    log(`New HTTPS CONNECT from ${clientIp} to ${req.url}`, 'info');
    // [目标解析] 解析客户端请求的真实目标
    const [targetHost, targetPort = 443] = parseRequestUrl(req.url);
    if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
        sendBadRequestResponseToClientSocket(clientSocket)
        return clientSocket.destroy()
    }
    // [二级代理连接] 连接到下游目标代理
    const proxySocket = net.connect(
        JUMPSERVER_CONFIG.TARGET_PROXY.port,
        JUMPSERVER_CONFIG.TARGET_PROXY.host,
        () => {
            // [核心改动]发送CONNECT指令到二级代理，要求在目标代理上建立到真实目标的隧道
            proxySocket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n\r\n`)
            // 等待二级代理响应
            proxySocket.once('data', (data) => {
                const response = data.toString()
                if (!response.startsWith('HTTP/1.1 200')) { // 判断代理是否成功建立
                    sendBadGatewayResponse(clientSocket, targetHost)
                    log(`Failed to establish tunnel to ${targetHost}`, 'error')
                    proxySocket.destroy()
                    return clientSocket.destroy()
                }
                // [管道建立]通知客户端隧道准备就绪
                clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
                // 转发后续数据流
                proxySocket.pipe(clientSocket).pipe(proxySocket)
            })
        }
    )
    // [统一的错误处理]
    // 设置超时和错误处理
    proxySocket.on('error', (err) => {
        if (err.code === 'ECONNABORTED') {
            log(`Connection aborted by server ${targetHost}:${targetPort}`, 'info');
        } else if (err.code === 'ETIMEDOUT') {
            log(`Connection to server ${targetHost}:${targetPort} timed out.`, 'info');
        } else if (err.code === 'ECONNRESET') {
            log(`Connection reset by server ${targetHost}:${targetPort}`, 'info');
        } else if (err.code === 'ENETUNREACH') {
            log(`Network is unreachable to server ${targetHost}:${targetPort}`, 'info');
        } else {
            log(`Unclassified Server socket error: ${err.message}`, 'warning');
        }
        proxySocket.end();
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
        sendBadGatewayResponseToClientSocket(clientSocket, `${targetHost}:${targetPort}`);
        clientSocket.end();
    });
    proxySocket.setTimeout(JUMPSERVER_CONFIG.SOCKET_TIMEOUT, () => {
        log(`Connection to server ${targetHost}:${targetPort} timed out.`, 'info');
        clientSocket.end();
    });
}

const main = async () => {
    if (JUMPSERVER_CONFIG.VERBOSE) {
        log('Verbose mode enabled.', 'info');
    }
    log('Jump Proxy is running...', 'info');
    log(`Allowed subnet: ${JUMPSERVER_CONFIG.ALLOWED_SUBNET}`, 'proxy');
    let server = http.createServer();
    let proxy = httpProxy.createProxyServer({});
    server.on('request', handleRequest(proxy));
    server.on('connect', handleConnect);
    server.listen(JUMPSERVER_CONFIG.LISTEN_PORT, JUMPSERVER_CONFIG.LISTEN_IP);
    log(`Jump Proxy listening on ${JUMPSERVER_CONFIG.LISTEN_IP}:${JUMPSERVER_CONFIG.LISTEN_PORT}`, 'proxy');
};

main();