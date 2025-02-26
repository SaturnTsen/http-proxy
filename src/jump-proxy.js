import http from 'http';
import httpProxy from 'http-proxy';
import net from 'net';
import JUMPSERVER_CONFIG from './constant.js';
import { getSocketIp, isAllowedSource } from './utils.js';

// 创建代理实例
const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
    // 真实客户端IP提取（兼容IPv6映射格式）
    const clientIp = req.socket.remoteAddress.replace(/^::ffff:/, '');

    // Phase 1: 前置安全验证
    if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end(`Forbidden client IP: ${clientIp}`);
        return console.log(`Block HTTP from ${clientIp} to ${req.url}`);
    }
    console.info(`HTTP from ${clientIp} to ${req.url}`);
    // Phase 2: 构建可信X-Forwarded-For链
    const existingXff = req.headers['x-forwarded-for'] || '';
    req.headers['x-forwarded-for'] = existingXff
        ? `${existingXff}, ${clientIp}`
        : clientIp;

    // Phase 3: 流量中转（带有透明错误处理）
    const proxyTarget = `http://${JUMPSERVER_CONFIG.TARGET_PROXY.host}:${JUMPSERVER_CONFIG.TARGET_PROXY.port}`;
    proxy.web(req, res, { target: proxyTarget });
});

// 集中式代理错误处理（替代分散的回调）
proxy.on('error', (err, req, res) => {
    if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
    }
    console.error(`Proxy Error [${req.method} ${req.url}]:`, err.message);
});

// 处理CONNECT方法 (HTTPS隧道)
// 跳板代理的CONNECT处理修改版
server.on('connect', (req, clientSocket) => {

    const clientIp = getSocketIp(clientSocket);
    if (!isAllowedSource(clientIp, JUMPSERVER_CONFIG.ALLOWED_SUBNET)) {
        return sendForbiddenResponseToClientSocket(clientSocket);
    }
    console.info(`HTTPS CONNECT from ${clientIp} to ${req.url}`);
    // [目标解析] 解析客户端请求的真实目标
    const [targetHost, targetPort = 443] = req.url.split(':') // 示例值：'example.com:443'
    if (!targetHost || !/^[\w\.-]+$/.test(targetHost)) {
        clientSocket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
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
                    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
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
        console.error(`Proxy Error: ${e.message}`)
        clientSocket.end()
    })

    clientSocket.on('error', (e) => {
        console.error(`Client Error: ${e.message}`)
        proxySocket.end()
    })
})

const sendForbiddenResponseToClientSocket = (clientSocket) => {
    clientSocket.write(
        'HTTP/1.1 403 Forbidden\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n403 Forbidden: Access is restricted to allowed subnet'
    );
    clientSocket.destroy();
    log(`Blocked request from ${getSocketIp(clientSocket)}`, 'warning');
};

server.listen(JUMPSERVER_CONFIG.LISTEN_PORT, JUMPSERVER_CONFIG.LISTEN_IP, () => {
    console.log(`Proxy bridge running on http://${JUMPSERVER_CONFIG.LISTEN_IP}:${JUMPSERVER_CONFIG.LISTEN_PORT}`);
});
