// utils.js
import { exec } from 'child_process';
import { isIPv6 } from 'net';
import CONFIG from './constant.js';

// 创建统一的日志函数
const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString().split('.')[0]; // 精确到秒
  if (level === 'proxy') {
    if (CONFIG.VERBOSE) {
      console.log(`[${timestamp}] [Proxy] ${message}`);
    }
  } else if (level === 'info') {
    if (CONFIG.VERBOSE) {
      console.log(`[${timestamp}] [Info] ${message}`);
    }
  } else if (level === 'warning') {
    console.warn(`[${timestamp}] [Warning] ${message}`);
  } else if (level === 'error') {
    console.error(`[${timestamp}] [Error] ${message}`);
  }
};

const ipToInt = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
const isValidIP = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(octet => parseInt(octet) <= 255);
const isAllowedSource = (ip) => {
  const [subnetBase, subnetMask] = CONFIG.ALLOWED_SUBNET.split('/');
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

  return { hostname, port };
};

const checkVPNConnection = () => {
  return new Promise((resolve) => {
    let command;
    if (process.platform === 'win32') {
      command = 'rasdial';
    } else if (process.platform === 'linux') {
      command = 'ifconfig | grep tun0';
    }

    exec(command, (error, stdout, stderr) => {
      if (process.platform === 'win32') {
        resolve(stdout.startsWith('No connections') ? 'VPN is not connected.' : 'VPN is connected.');
      } else {
        resolve(error || stderr || !stdout ? 'VPN is not connected.' : 'VPN is connected.');
      }
    });
  });
};

const connectVPN = () => {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32'
      ? `rasdial ${CONFIG.VPN_NAME}`
      : CONFIG.VPN_COMMAND;

    exec(command, (error, stderr) => {
      if (error || stderr) {
        reject('Failed to connect VPN.');
      } else {
        resolve('VPN connected successfully.');
      }
    });
  });
};

const ensureVPNConnection = async () => {
  log('Checking VPN connection status...', 'proxy');
  const vpnStatus = await checkVPNConnection();
  if (vpnStatus === 'VPN is not connected.') {
    log(`Attempting to connect to VPN: ${CONFIG.VPN_NAME}...`, 'proxy');
    await connectVPN();
    log(`VPN ${CONFIG.VPN_NAME} is now connected!`, 'proxy');
  } else {
    log('VPN is already connected.', 'proxy');
  }
};

const disconnectVPN = () => {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32'
      ? `rasdial "${CONFIG.VPN_NAME}" /disconnect`
      : CONFIG.DISCONNECT_VPN_COMMAND;

    exec(command, (error, stderr) => {
      if (error || stderr) {
        reject('Failed to disconnect VPN.');
      } else {
        resolve('VPN disconnected successfully.');
      }
    });
  });
};

export { ensureVPNConnection, disconnectVPN, isAllowedSource, parseRequestUrl, log };
