@echo off
echo Starting the proxy server...


:: Run the proxy.js script using npm

:: This script should be run from the root of the project instead of the exec
:: folder

cd /d:%~dp0..
npm run serve

pause
