// example.constant.js

const CONFIG = {
  PROXY_PORT: 7890, // 代理服务监听的端口
  LISTEN_ADDRESS: '192.168.25.137', // 虚拟机监听的地址

  ALLOWED_SUBNET: '192.168.1.1/16', // 允许访问的网段前缀

  SOCKET_TIMEOUT: 10000, // Socket 超时时间
  RESTART_TIMEOUT: 5000, // 重启服务器的时间间隔

  VPN_NAME: 'YOUR_VPN_CONNECTION_NAME', // For Windows: VPN 连接名称
  VPN_COMMAND: 'sudo openvpn --config /path/to/your/vpn/config.ovpn', // For Linux: VPN 连接命令
  DISCONNECT_VPN_COMMAND: 'sudo pkill openvpn', // For Linux: 断开 VPN 连接命令
  VPN_CHECK_INTERVAL: 20000,

  DEBUG: false, // 是否开启调试模式
};

const JUMPSERVER_CONFIG = {
  LISTEN_PORT: 9260,
  LISTEN_IP: '192.168.135.1',
  ALLOWED_SUBNET: '192.168.0.0/16', // 允许访问的网段前缀
  TARGET_PROXY: {
    host: '192.168.25.137', // 和上方的 LISTEN_ADDRESS 一致
    port: 7890            // 和上方的 PROXY_PORT 一致
  }
};

export { CONFIG, JUMPSERVER_CONFIG };
