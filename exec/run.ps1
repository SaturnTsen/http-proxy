Write-Host "Starting the proxy server..."

# Change to the project root directory
Set-Location -Path (Join-Path $PSScriptRoot '..')

# Run the proxy.js script using npm
npm run start $args

Read-Host -Prompt "Press Enter to exit"