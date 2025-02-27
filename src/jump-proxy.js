import http from 'http';
import httpProxy from 'http-proxy';
import net from 'net';
import { JUMPSERVER_CONFIG } from '../constant.js';
import { getSocketIp, isAllowedSource, logger } from './utils.js';
import { sendBadGatewayResponse, sendBadRequestResponse, sendBadRequestResponseToClientSocket, sendForbiddenResponseToClientSocket } from './error-handlers.js';

const log = logger(JUMPSERVER_CONFIG.VERBOSE);

const handleRequest = (proxy) => {
    return (req, res) => {
        // 真实客户端IP提取（兼容IPv6映射格式）
        const clientIp = req.socket.remoteAddress.replace(/^::ffff:/, '');

        // Phase 1: 前置安全验证
        if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
            return sendBadRequestResponse(res, 'Access is restricted to allowed subnet');
        }
        log(`New HTTP request from ${clientIp} to ${req.url}`, 'info');
        // Phase 2: 构建可信X-Forwarded-For链
        const existingXff = req.headers['x-forwarded-for'] || '';
        req.headers['x-forwarded-for'] = existingXff
            ? `${existingXff}, ${clientIp}`
            : clientIp;

        // Phase 3: 流量中转（带有透明错误处理）
        const proxyTarget = `http://${JUMPSERVER_CONFIG.TARGET_PROXY.host}:${JUMPSERVER_CONFIG.TARGET_PROXY.port}`;
        proxy.web(req, res, { target: proxyTarget });
    }
};

// 处理CONNECT方法 (HTTPS隧道)
// 跳板代理的CONNECT处理修改版
const handleConnect = (req, clientSocket) => {

    const clientIp = getSocketIp(clientSocket);
    if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
        return sendForbiddenResponseToClientSocket(clientSocket);
    }
    log(`New HTTPS CONNECT from ${clientIp} to ${req.url}`, 'info');
    // [目标解析] 解析客户端请求的真实目标
    const [targetHost, targetPort = 443] = req.url.split(':') // 示例值：'example.com:443'
    if (!targetHost || !/^[\w\.-]+$/.test(targetHost)) {
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
    proxySocket.on('error', (e) => {
        log(`Proxy Error: ${e.message}`, 'error')
        clientSocket.end()
    })

    clientSocket.on('error', (e) => {
        log(`Client Error: ${e.message}`, 'error')
        proxySocket.end()
    })
}

const main = () => {
    if (JUMPSERVER_CONFIG.VERBOSE) {
        log('Verbose mode enabled.', 'info');
    }
    log('Jump Proxy is running...', 'info');
    log(`Allowed subnet: ${JUMPSERVER_CONFIG.ALLOWED_SUBNET}`, 'proxy');
    let proxy = httpProxy.createProxyServer({});
    let server = http.createServer(handleRequest(proxy));
    proxy.on('error', (err, req, res) => {
        log(`HTTP Proxy Error: ${err.message}`, 'error');
        sendBadGatewayResponse(res, req.url);
    });
    server.on('connect', handleConnect);
    log(`Jump Proxy listening on ${JUMPSERVER_CONFIG.LISTEN_IP}:${JUMPSERVER_CONFIG.LISTEN_PORT}`, 'proxy');
    server.listen(JUMPSERVER_CONFIG.LISTEN_PORT, JUMPSERVER_CONFIG.LISTEN_IP);
};

main();