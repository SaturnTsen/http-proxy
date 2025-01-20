#!/bin/bash
# This script should be run from the root of the project instead of the exec
# folder

echo "Starting the proxy server..."

# Run the proxy.js script using npm
npm run start "$@"

read -p "Press Enter to exit"