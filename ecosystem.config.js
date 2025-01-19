module.exports = {
  apps: [
    {
      name: "proxy-server",          // 应用名称
      script: "proxy.js",           // 启动脚本
      watch: true,                  // 自动重启
      autorestart: true,            // 应用崩溃时自动重启
      max_memory_restart: "200M",   // 内存占用超过 200MB 时重启
      env: {
        NODE_ENV: "production",     // 环境变量
      },
    },
  ],
};
