#!/bin/bash

echo "Starting local setup..."

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "Redis is not installed. Installing now..."
    
    # Install Redis based on the OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if ! command -v brew &> /dev/null; then
            echo "Homebrew is not installed. Please install Homebrew first: https://brew.sh/"
            exit 1
        fi
        brew install redis
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo apt update && sudo apt install -y redis
    else
        echo "Unsupported OS. Please install Redis manually."
        exit 1
    fi

    echo "Redis installation complete."
else
    echo "Redis is already installed."
fi

# Provide instructions for starting Redis
echo "To start Redis, use one of the following:"
echo " - macOS: 'brew services start redis' (recommended for background service)"
echo " - macOS/Linux (as a foreground process): 'redis-server --bind 127.0.0.1'"
echo ""
echo "You can now run 'honcho start' to start your application."

echo "Setup complete!"
