// utils.js
const child_process = require('child_process');
const CONFIG = require('./constant');

// 创建统一的日志函数
const log = (message) => {
  console.log(`[Proxy] ${message}`);
};

const logInfo = (message) => {
  console.log(`[Info] ${message}`);
};

// 检查 VPN 连接状态，如果未连接则自动连接
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

module.exports = { ensureVPNConnection, disconnectVPN, log, logInfo };
