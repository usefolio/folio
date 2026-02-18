#!/usr/bin/env bash
#
# run_local.sh – build the folio-sheet image and run it with env vars
#
# Prereqs:
# • Docker daemon running (docker ps should work)
# • Buildpacks CLI (`pack`) in your PATH (brew install buildpacks/tap/pack or https://buildpacks.io)
#
# Usage:
# ./run_local.sh # builds and runs on port 8000
# PORT=9000 ./run_local.sh # choose a different host port
# ENV_FILE=./api/.env.dev ./run_local.sh # point to another env file
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="folio-sheet-local"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/api/.env.local}"
HOST_PORT="${PORT:-8000}" # host-visible port; container still listens on 8000

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker daemon is not running"
    exit 1
fi

if ! command -v pack &> /dev/null; then
    echo "❌ Buildpacks CLI (pack) is not installed or not in PATH"
    echo "Install with: brew install buildpacks/tap/pack or visit https://buildpacks.io"
    exit 1
fi

# Check for environment file
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    exit 1
fi

# Clean and stage libs
echo "⏳ Staging libs → ./api ..."
rm -rf "$ROOT_DIR/api/libs" "$ROOT_DIR/api/queue_processor" || true

# Check if source directories exist before copying
if [ -d "$ROOT_DIR/libs" ]; then
    cp -R "$ROOT_DIR/libs" "$ROOT_DIR/api/libs"
else
    echo "⚠️ Warning: $ROOT_DIR/libs directory not found, continuing without it"
fi

if [ -d "$ROOT_DIR/queue_processor" ]; then
    cp -R "$ROOT_DIR/queue_processor" "$ROOT_DIR/api/queue_processor"
else
    echo "⚠️ Warning: $ROOT_DIR/queue_processor directory not found, continuing without it"
fi

# Determine platform architecture
PLATFORM="linux/amd64"
if [ "$(uname -m)" = "arm64" ]; then
    echo "ℹ️ Detected ARM64 architecture"
    # Uncomment below to use native architecture instead of x86 emulation
    # PLATFORM="linux/arm64"
fi

echo "🏗️ Building image '$IMAGE_NAME' with Buildpacks ..."
pack build "$IMAGE_NAME" \
  --builder gcr.io/buildpacks/builder:latest \
  --path "$ROOT_DIR/api" \
  --platform "$PLATFORM"

# Run the container
echo "🚀 Running container at http://localhost:$HOST_PORT ..."
docker run --rm -it \
  --env-file "$ENV_FILE" \
  -p "$HOST_PORT":8000 \
  "$IMAGE_NAME"

# Optional: cleanup copied files after container exits
# echo "🧹 Cleaning up staged files..."
# rm -rf "$ROOT_DIR/api/libs" "$ROOT_DIR/api/queue_processor"
