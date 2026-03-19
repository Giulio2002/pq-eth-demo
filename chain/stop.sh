#!/bin/bash
set -e

ENCLAVE_NAME="pq-demo"

echo "[chain] Stopping Kurtosis enclave '$ENCLAVE_NAME'..."
kurtosis enclave rm -f "$ENCLAVE_NAME" 2>/dev/null || true
echo "[chain] Devnet stopped."
