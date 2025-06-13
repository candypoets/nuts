#!/bin/bash

set -e

echo "Building with explicit source map generation..."

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf pkg/
rm -rf target/

# Method 1: Try with wasm-pack profiling mode (includes debug info)
echo "Attempting build with profiling mode..."
wasm-pack build \
    --target web \
    --out-dir pkg \
    --mode no-install \
    --profiling \
    -- \
    --features console_error_panic_hook

echo "Files after profiling build:"
ls -la pkg/
