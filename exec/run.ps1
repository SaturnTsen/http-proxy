Write-Host "Starting the proxy server..."

# Run the proxy.js script using npm
# This script should be run from the root of the project
npm run start $args

Read-Host -Prompt "Press Enter to exit"