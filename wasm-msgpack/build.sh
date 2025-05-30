#!/bin/bash

# Build script for Rust WASM msgpack decoder

set -e

echo "Building Rust WASM msgpack decoder..."

# Install wasm-pack if not available
if ! command -v wasm-pack &> /dev/null; then
    echo "wasm-pack not found. Installing..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build the WASM module
wasm-pack build --target web --out-dir ../src/lib/wasm-msgpack --no-typescript

# Copy the generated files to static directory for easier access
cp ../src/lib/wasm-msgpack/wasm_msgpack_bg.wasm ../static/wasm_msgpack.wasm

echo "Build complete! Files generated:"
echo "  - ../static/wasm_msgpack.wasm"
echo "  - ../src/lib/wasm-msgpack/wasm_msgpack.js"
echo "  - ../src/lib/wasm-msgpack/wasm_msgpack_bg.wasm"