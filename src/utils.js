// utils.js
import child_process from 'child_process';
import { isIPv6 } from 'net';
import { CONFIG } from '../constant.js';

// 创建统一的日志函数
const logger = (VERBOSE) => {
  return (message, level = 'info') => {
    const timestamp = new Date().toISOString().split('.')[0]; // 精确到秒
    if (level === 'proxy') {
      console.log(`[${timestamp}] [Proxy] ${message}`);
    } else if (level === 'info') {
      if (VERBOSE) {
        console.log(`[${timestamp}] [Info] ${message}`);
      }
    } else if (level === 'warning') {
      console.warn(`[${timestamp}] [Warning] ${message}`);
    } else if (level === 'error') {
      console.error(`[${timestamp}] [Error] ${message}`);
    }
  }
};

const log = logger(CONFIG.VERBOSE);

// URL parser
const ipToInt = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
const isValidIP = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(octet => parseInt(octet) <= 255);
const isAllowedSource = (ip, allowed_subnet) => {
  const [subnetBase, subnetMask] = allowed_subnet.split('/');
  const subnetMaskInt = parseInt(subnetMask, 10);
  if (!isValidIP(ip) || !isValidIP(subnetBase)) {
    throw new Error('Invalid IP address or subnet.');
  }
  const ipInt = ipToInt(ip);
  const subnetBaseInt = ipToInt(subnetBase);
  const mask = ~((1 << (32 - subnetMaskInt)) - 1);
  return (ipInt & mask) === (subnetBaseInt & mask);
};

const parseRequestUrl = (requestUrl) => {
  let hostname = '';
  let port = '';

  if (requestUrl.startsWith('[')) {
    const closingBracketIndex = requestUrl.indexOf(']');
    if (closingBracketIndex !== -1) {
      hostname = requestUrl.substring(1, closingBracketIndex);
      const rest = requestUrl.substring(closingBracketIndex + 1);
      if (rest.startsWith(':')) {
        port = rest.substring(1);
      }
    } else {
      throw new Error('Invalid IPv6 address format: missing closing bracket');
    }
  } else {
    const lastColonIndex = requestUrl.lastIndexOf(':');
    if (lastColonIndex !== -1) {
      const potentialPort = requestUrl.substring(lastColonIndex + 1);
      if (/^\d+$/.test(potentialPort)) {
        hostname = requestUrl.substring(0, lastColonIndex);
        port = potentialPort;
        if (isIPv6(hostname)) {
          hostname = `[${hostname}]`;
        }
      } else {
        hostname = requestUrl;
      }
    } else {
      hostname = requestUrl;
    }
  }

  return [hostname, port];
};

const isValidUrl = (hostname, port) => {
  if (!hostname) return false;
  // Handle IPv6
  if (hostname.includes(':')) {
    if (!isIPv6(hostname.replace(/[[]]/g, ''))) return false;
  }
  // Validate port if provided
  if (port) {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return false;
  }
  return true;
};

const getSocketIp = (socket, req = null) => {
  // 优先从X-Forwarded-For取第一个地址
  if (req?.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  if (!socket || !socket.remoteAddress) {
    log('Failed to get remote address from socket, returning 0.0.0.0', 'error');
    // 添加traceback
    // TODO 优化错误处理
    const stack = new Error().stack;
    log(`Traceback: ${stack}`, 'debug');
    return '0.0.0.0'; // 默认返回值
  }
  return socket.remoteAddress.replace(/^::ffff:/, ''); // 兼容IPv4-mapped地址
};

// VPN Connection

const checkVPNConnection = () => {
  return new Promise((resolve) => {
    let command;
    if (process.platform === 'win32') {
      command = 'rasdial';
    } else if (process.platform === 'linux') {
      command = 'ifconfig | grep tun0';
    }

    child_process.exec(command, (error, stdout, stderr) => {
      if (process.platform === 'win32') {
        resolve(stdout.startsWith('No connections') ? 'VPN is not connected.' : 'VPN is connected.');
      } else {
        resolve(error || stderr || !stdout ? 'VPN is not connected.' : 'VPN is connected.');
      }
    });
  });
};


// 自动连接 VPN
const connectVPN = () => {
  return new Promise((resolve, reject) => {
    let command;
    if (process.platform === 'win32') {
      // Windows: 使用 rasdial 连接 VPN
      command = `rasdial ${CONFIG.VPN_NAME}`;
    } else if (process.platform === 'linux') {
      // Linux: 使用系统命令连接 VPN
      command = CONFIG.VPN_COMMAND;
    }

    child_process.exec(command, (error, stdout, stderr) => {
      if (error || stderr) {
        reject('Failed to connect VPN.');
      } else {
        resolve('VPN connected successfully.');
      }
    });
  });
};


const ensureVPNConnection = async () => {
  log('Checking VPN connection status...', 'debug');
  const vpnStatus = await checkVPNConnection();
  if (vpnStatus === 'VPN is not connected.') {
    log(`VPN ${CONFIG.VPN_NAME} is not connected.`, 'warning');
    log(`Attempting to connect to VPN: ${CONFIG.VPN_NAME}...`, 'proxy');
    await connectVPN();
    log(`VPN ${CONFIG.VPN_NAME} is now connected!`, 'proxy');
  } else {
    log('VPN is already connected.', 'debug');
  }
};

// 断开 VPN 连接
const disconnectVPN = () => {
  return new Promise((resolve, reject) => {
    let command;
    if (process.platform === 'win32') {
      // Windows: 使用 rasdial /disconnect 命令断开 VPN
      command = `rasdial "${CONFIG.VPN_NAME}" /disconnect`; // 使用从 constant.js 引入的 VPN 名称
    } else if (process.platform === 'linux') {
      // Linux:
      command = CONFIG.DISCONNECT_VPN_COMMAND;
    }

    child_process.exec(command, (error, stdout, stderr) => {
      if (error || stderr) {
        reject('Failed to disconnect VPN.');
      } else {
        resolve('VPN disconnected successfully.');
      }
    });
  });
};

export {
  ensureVPNConnection,
  disconnectVPN,
  isAllowedSource,
  parseRequestUrl,
  isValidUrl,
  getSocketIp,
  logger
};
