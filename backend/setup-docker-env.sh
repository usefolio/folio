#!/bin/bash

# Script to create Docker-compatible environment file
# This ensures sensitive data doesn't get checked into the repo

set -e

echo "Setting up Docker environment file..."

# Check if .env.sample exists
if [ ! -f ".env.sample" ]; then
    echo "Error: .env.sample not found. Please make sure you're running this from the project root."
    exit 1
fi

# Create .env.docker from .env.sample with Docker-specific modifications
cp .env.sample .env.docker

# Update Redis URL for Docker Compose networking
sed -i.bak 's|REDIS_URL=redis://127.0.0.1:6379/0|REDIS_URL=redis://redis:6379/0|g' .env.docker

# Update PYTHONPATH for Docker container structure
sed -i.bak 's|PYTHONPATH="${PYTHONPATH}:../libs:../queue_processor"|PYTHONPATH="/app/libs:/app/queue_processor"|g' .env.docker

# Update LIBS_PATH for Docker
sed -i.bak 's|LIBS_PATH=./libs|LIBS_PATH=/app/libs|g' .env.docker

# Clean up backup file
rm -f .env.docker.bak

echo "✅ Created .env.docker"
echo ""
echo "⚠️  IMPORTANT: Edit .env.docker and replace placeholder values with your actual:"
echo "   - API keys and secrets"
echo "   - Database credentials" 
echo "   - Service account JSON (for TEST_FOLIO_SHEET_CONFIG)"
echo "   - Other environment-specific values"
echo ""
echo "You can also copy values from your existing api/.env.local file."
echo ""
echo "Once configured, run: docker compose up --build -d"
