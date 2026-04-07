#!/bin/sh
set -e

PORT=${PORT:-7350}

echo "Running database migrations..."
/nakama/nakama migrate up --database.address "${DATABASE_URL}"

echo "Starting Nakama on port ${PORT}..."
exec /nakama/nakama \
  --name tictactoe \
  --database.address "${DATABASE_URL}" \
  --logger.level DEBUG \
  --socket.port "${PORT}" \
  --socket.server_key "defaultkey" \
  --session.token_expiry_sec 86400 \
  --runtime.http_key "defaulthttpkey" \
  --runtime.path "/nakama/data/modules"
