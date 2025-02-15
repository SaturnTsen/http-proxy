module.exports = {
  apps: [
    {
      name: "http-proxy",
      // patch the npm path
      script: "C:\\nvm4w\\nodejs\\node_modules\\npm\\bin\\npm-cli.js",
      watch: true,                  // 自动重启
      autorestart: true,            // 应用崩溃时自动重启
      args: "start",
      max_memory_restart: "500M",   // 内存占用超过 500MB 时重启
      env: {
        NODE_ENV: "production",     // 环境变量
      },
    },
  ],
};
