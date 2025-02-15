// example.constant.js

const CONFIG = {
  PROXY_PORT: 7890, // 代理服务监听的端口
  LISTEN_ADDRESS: '192.168.1.29', // 虚拟机监听的地址
  ALLOWED_SUBNET: '192.168.1.1/24', // 允许访问的网段前缀
  VPN_NAME: 'YOUR_VPN_CONNECTION_NAME', // For Windows: VPN 连接名称
  VPN_COMMAND: 'sudo openvpn --config /path/to/your/vpn/config.ovpn', // For Linux: VPN 连接命令
  DISCONNECT_VPN_COMMAND: 'sudo pkill openvpn', // For Linux: 断开 VPN 连接命令
  SOCKET_TIMEOUT: 10000, // Socket 超时时间
  RESTART_TIMEOUT: 5000,
  VPN_CHECK_INTERVAL: 20000,
  DEBUG: false, // 是否开启调试模式
};

export default CONFIG;
