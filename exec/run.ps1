Write-Host "Starting the proxy server..."

# Run the proxy.js script using npm

# Change directory to the parent directory of the current script
Set-Location -Path (Get-Item -Path $PSScriptRoot).Parent.FullName

# Run the proxy.js script using npm
npm run serve

Read-Host -Prompt "Press Enter to exit"