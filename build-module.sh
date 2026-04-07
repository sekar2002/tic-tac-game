#!/bin/bash
# Build Go module for Nakama

echo "Building Nakama Go module..."

# Build as shared library
docker run --rm \
  -w /builder \
  -v "${PWD}/nakama/data/modules:/builder" \
  heroiclabs/nakama-pluginbuilder:3.22.0 \
  build -buildmode=plugin -o /builder/main.so

echo "Build complete! main.so created."
echo "Now restart Nakama: sudo docker compose restart nakama"
