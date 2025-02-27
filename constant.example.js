// example.constant.js

const CONFIG = {
  PROXY_PORT: 1080, // 代理服务监听的端口
  LISTEN_ADDRESS: '192.168.22.135', // 虚拟机监听的地址
  ALLOWED_SUBNET: '192.168.0.0/16', // 允许访问的网段前缀
  VPN_NAME: 'SJTU',
  VPN_COMMAND: 'rasdial',
  DISCONNECT_VPN_COMMAND: 'rasdial /disconnect',
  SOCKET_TIMEOUT: 100000, // Socket 超时时间
  RESTART_TIMEOUT: 5000, // 重启服务器的时间间隔
  VPN_CHECK_INTERVAL: 8000, // 检查 VPN 连接状态的时间间隔
  VERBOSE: true, // 是否开启调试模式
  AUTO_DISCONNECT_VPN_ON_SIGNAL: true, // 是否在收到信号时自动断开 VPN
};

const JUMPSERVER_CONFIG = {
  LISTEN_PORT: 9260,
  LISTEN_IP: '192.168.137.1',
  ALLOWED_SUBNET: '192.168.0.0/16', // 允许访问的网段前缀
  TARGET_PROXY: {
    host: '192.168.22.135', // 修改为虚拟机代理的实际IP
    port: 1080            // 修改为虚拟机代理的实际端口
  },
  VERBOSE: true, // 是否开启调试模式
};

export { CONFIG, JUMPSERVER_CONFIG };
