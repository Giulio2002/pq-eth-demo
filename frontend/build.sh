#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[frontend] Building PQ WASM module..."
cd "$SCRIPT_DIR/pq-wasm"
wasm-pack build --target web --release

echo "[frontend] Copying WASM binary to public/..."
mkdir -p "$SCRIPT_DIR/public"
cp "$SCRIPT_DIR/pq-wasm/pkg/pq_wasm_bg.wasm" "$SCRIPT_DIR/public/pq_wasm_bg.wasm"

echo "[frontend] Installing npm dependencies..."
cd "$SCRIPT_DIR"
npm install

echo "[frontend] Building Next.js app..."
npm run build

echo "[frontend] Done."
