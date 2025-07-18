#!/bin/bash

set -e

echo "🚀 Building WASM modules..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

# Build Rust nostr-main project
echo ""
echo "🦀 Building Rust nostr-main project..."
cd "$SCRIPT_DIR/nostr-main"
./build.sh
cd "$SCRIPT_DIR"


# Build Rust nostr-worker project
echo ""
echo "🦀 Building Rust nostr-worker project..."
cd "$SCRIPT_DIR/nostr-worker"
./build.sh
cd "$SCRIPT_DIR"


echo ""
echo "✅ Rust WASM modules built successfully!"
echo ""
echo "Generated files in static directory:"
echo "  - nostr_main.wasm + bindings (Rust nostr-main)"
echo "  - nutscash_nostr_worker.wasm + bindings (Rust nostr-worker)"
echo ""
echo "🎉 Build complete!"
