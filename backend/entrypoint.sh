#!/bin/bash
set -euo pipefail

# Keep Redis tied to this container lifecycle.
redis-server --save "" --appendonly no &
redis_pid=$!

echo "Waiting for Redis to be ready..."
while ! redis-cli ping | grep -q "PONG"; do
  echo "Redis is not ready yet. Retrying in 1 second..."
  sleep 1
done
echo "Redis is ready!"

# Start worker (required) and Flower (optional).
/cnb/process/web "$@" &
worker_pid=$!

pids=("$redis_pid" "$worker_pid")
if [ "${ENABLE_FLOWER:-true}" = "true" ]; then
  /cnb/process/flower "$@" &
  flower_pid=$!
  pids+=("$flower_pid")
fi

# Exit the container if any child exits so Cloud Run can restart it.
wait -n "${pids[@]}"
exit_code=$?
kill "${pids[@]}" 2>/dev/null || true
wait || true
exit "$exit_code"

