#!/bin/bash
# Build script for Nakama Go module
# This compiles the Go module into a .so shared library

set -e

MODULE_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$MODULE_DIR/../nakama/data/modules"

echo "=== Building Nakama Go Module ==="

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Download dependencies
echo "Downloading dependencies..."
cd "$MODULE_DIR"
go mod download

# Build the shared library
echo "Compiling module..."
CGO_ENABLED=1 go build -buildmode=plugin -o "$OUTPUT_DIR/tictactoe.so" main.go

echo "=== Build successful! ==="
echo "Module compiled at: $OUTPUT_DIR/tictactoe.so"
echo "Restart Nakama with: docker compose restart nakama"
