#!/bin/bash
echo "Starting the proxy server..."

# Change to the project root directory
cd "$(dirname "$0")/.."

# Run the proxy.js script using npm
npm run start "$@"

read -p "Press Enter to exit"