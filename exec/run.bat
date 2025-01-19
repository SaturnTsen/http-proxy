@echo off
echo Starting the proxy server...

:: Change to the project root directory
cd /d %~dp0..

:: Run the proxy.js script using npm
npm run start %*

pause
