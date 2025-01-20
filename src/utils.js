// utils.js
const child_process = require('child_process');
const CONFIG = require('./constant');

// 创建统一的日志函数
const log = (message, level = 'info') => {
  const timestamp = new Date().toISOString().split('.')[0]; // 精确到秒
  if (level === 'proxy') {
    console.log(`[${timestamp}] [Proxy] ${message}`);
  } else if (level === 'info') {
    if (CONFIG.VERBOSE) {
      console.log(`[${timestamp}] [Info] ${message}`);
    }
  } else if (level === 'warning') {
    if (CONFIG.VERBOSE) {
      console.warn(`[${timestamp}] [Warning] ${message}`);
    }
  } else if (level === 'error') {
    console.error(`[${timestamp}] [Error] ${message}`);
  }
};

/**
 * Checks if the given IP address is within the allowed subnet.
 *
 * @param {string} ip - The IP address to check.
 * @returns {boolean} - Returns true if the IP address is within the allowed subnet, otherwise false.
 *
 * @example
 * // Assuming CONFIG.ALLOWED_SUBNET is '192.168.1.0/24'
 * isAllowedSource('192.168.1.5'); // true
 * isAllowedSource('192.168.2.5'); // false
 *
 * @typedef {Object} CONFIG
 * @property {string} ALLOWED_SUBNET - The allowed subnet in CIDR notation (e.g., '192.168.1.0/24').
 */
const ipToInt = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
const isValidIP = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(octet => parseInt(octet) <= 255);
const isAllowedSource = (ip) => {
  const [subnetBase, subnetMask] = CONFIG.ALLOWED_SUBNET.split('/');
  const subnetMaskInt = parseInt(subnetMask, 10);
  // 校验 IP 地址有效性
  if (!isValidIP(ip) || !isValidIP(subnetBase)) {
    throw new Error('Invalid IP address or subnet.');
  }
  // 将 IP 转换为 32 位整数
  const ipInt = ipToInt(ip);
  const subnetBaseInt = ipToInt(subnetBase);
  const mask = ~((1 << (32 - subnetMaskInt)) - 1);  // 生成子网掩码
  return (ipInt & mask) === (subnetBaseInt & mask);
};


// 检查 VPN 连接状态，如果未连接则自动连接
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

// 检查系统是否连接了 VPN
const checkVPNConnection = () => {
  // eslint-disable-next-line no-unused-vars
  return new Promise((resolve, reject) => {
    let command;
    if (process.platform === 'win32') {
      // Windows: 使用 rasdial 命令检查 VPN 连接
      command = 'rasdial';
    } else if (process.platform === 'linux') {
      // Linux: 使用 ifconfig 或 ip 命令检查 VPN 适配器
      command = 'ifconfig | grep tun0'; // 如果是 OpenVPN，通常是 tun0 接口
    }

    child_process.exec(command, (error, stdout, stderr) => {
      if (process.platform === 'win32') {
        // Windows 系统
        if (stdout.startsWith('No connections')) {
          resolve('VPN is not connected.');
        } else {
          resolve('VPN is connected.');
        }
      } else {
        // Linux 或其他系统
        if (error || stderr || !stdout) {
          resolve('VPN is not connected.');
        } else {
          resolve('VPN is connected.');
        }
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

module.exports = { ensureVPNConnection, disconnectVPN, isAllowedSource, log };
