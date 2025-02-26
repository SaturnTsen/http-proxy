// Https error handlers
const sendForbiddenResponseToClientSocket = (clientSocket) => {
    clientSocket.write(
        'HTTP/1.1 403 Forbidden\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n403 Forbidden: Access is restricted to allowed subnet'
    );
    clientSocket.destroy();
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
};

const sendBadGatewayResponse = (res, target) => {
    res.writeHead(502);
    res.end('Bad Gateway');
};

const sendBadRequestResponse = (res, message) => {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end(`400 Bad Request: ${message}`);
};

export { sendForbiddenResponseToClientSocket, sendBadRequestResponseToClientSocket, sendForbiddenResponse, sendBadGatewayResponse, sendBadRequestResponse };