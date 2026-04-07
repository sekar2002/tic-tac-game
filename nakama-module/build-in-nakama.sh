#!/bin/bash
# Build the Go module inside the actual Nakama container to ensure exact Go version match
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODULE_SRC="$PROJECT_DIR/nakama-module"
MODULE_DST="$PROJECT_DIR/nakama/data/modules"

mkdir -p "$MODULE_DST"

echo "=== Building Go module inside Nakama container ==="

# Copy source files to modules directory
cp "$MODULE_SRC/main.go" "$MODULE_DST/"
cp "$MODULE_SRC/go.mod" "$MODULE_DST/"
cp "$MODULE_SRC/go.sum" "$MODULE_DST/"

# Start Nakama container temporarily to build the module
echo "Starting temporary build container..."
docker run --rm --name nakama-build \
  -v "$MODULE_DST:/nakama/data/modules" \
  --entrypoint /bin/sh \
  registry.heroiclabs.com/heroiclabs/nakama:3.22.0 \
  -c "cd /nakama/data/modules && go build -buildmode=plugin -o tictactoe.so main.go 2>&1"

# Clean up source files from modules directory
rm -f "$MODULE_DST/main.go" "$MODULE_DST/go.mod" "$MODULE_DST/go.sum"

echo "=== Build complete ==="
ls -lh "$MODULE_DST/tictactoe.so"
