@echo off
echo Starting the proxy server...

:: Run the proxy.js script using npm
:: Ensure that you have configured ecosystem.config.js

:: This script should be run from the root of the project instead of the exec
:: folder
pm2 start ecosystem.config.js

pause