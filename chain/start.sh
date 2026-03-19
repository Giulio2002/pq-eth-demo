#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENCLAVE_NAME="pq-demo"

# ── Prerequisites ────────────────────────────────────────────────────────────

echo "[chain] Checking prerequisites..."

if ! command -v docker &>/dev/null; then
    echo "ERROR: Docker is not installed. Install Docker Desktop first."
    exit 1
fi

if ! docker info &>/dev/null; then
    echo "ERROR: Docker daemon is not running. Start Docker Desktop first."
    exit 1
fi

if ! command -v kurtosis &>/dev/null; then
    echo "ERROR: Kurtosis CLI is not installed."
    echo "  Install: brew install kurtosis-tech/tap/kurtosis-cli"
    echo "  Or:      curl -sSL https://get.kurtosis.com | bash"
    exit 1
fi

if ! command -v git &>/dev/null; then
    echo "ERROR: Git is not installed."
    exit 1
fi

if ! command -v curl &>/dev/null; then
    echo "ERROR: curl is not installed."
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 is not installed."
    exit 1
fi

echo "[chain] All prerequisites met."

# ── Ensure Kurtosis engine is running ────────────────────────────────────────

if ! kurtosis engine status 2>&1 | grep -q "Running"; then
    echo "[chain] Starting Kurtosis engine..."
    kurtosis engine start
fi

# ── Build Erigon PQ Docker image if needed ───────────────────────────────────

if docker image inspect erigon-pq:local &>/dev/null; then
    echo "[chain] Erigon PQ Docker image (erigon-pq:local) already exists. Skipping build."
else
    echo "[chain] Building Erigon PQ Docker image from docker_pq-precompiles branch..."
    echo "[chain] This may take 10-20 minutes due to Rust CGO compilation."

    ERIGON_TMP="/tmp/erigon-pq"
    if [ -d "$ERIGON_TMP" ]; then
        echo "[chain] Reusing existing clone at $ERIGON_TMP"
        cd "$ERIGON_TMP"
        git fetch origin docker_pq-precompiles --depth 1 2>/dev/null || true
    else
        echo "[chain] Cloning Giulio2002/erigon (docker_pq-precompiles branch)..."
        git clone --branch docker_pq-precompiles --depth 1 \
            https://github.com/Giulio2002/erigon.git "$ERIGON_TMP"
        cd "$ERIGON_TMP"
    fi

    # The Dockerfile COPYs ntt_local/ and the Erigon branch references pq-eth-precompiles v0.3.0,
    # but the Go code needs newer symbols. Clone latest pq-eth-precompiles and set up a local replace.
    PQ_TMP="/tmp/pq-eth-precompiles"
    if [ ! -d "$PQ_TMP" ]; then
        echo "[chain] Cloning pq-eth-precompiles for native library..."
        git clone --depth 1 https://github.com/Giulio2002/pq-eth-precompiles.git "$PQ_TMP"
    fi

    # Copy Go module with precompiled static libs into ntt_local/
    # Must be a flat copy (ntt_local/go.mod, ntt_local/ntt/) — not nested under go/
    rm -rf "$ERIGON_TMP/ntt_local"
    mkdir -p "$ERIGON_TMP/ntt_local"
    cp -r "$PQ_TMP/go/"* "$ERIGON_TMP/ntt_local/"

    # Also copy Rust source for in-Docker compilation of the native library
    mkdir -p "$ERIGON_TMP/ntt_local/rust"
    cp "$PQ_TMP/Cargo.toml" "$ERIGON_TMP/ntt_local/rust/"
    cp -r "$PQ_TMP/src" "$ERIGON_TMP/ntt_local/rust/"
    cp -r "$PQ_TMP/benches" "$ERIGON_TMP/ntt_local/rust/" 2>/dev/null || true

    # Add replace directive so the build uses the local (latest) library
    if ! grep -q "replace github.com/Giulio2002/pq-eth-precompiles/go" "$ERIGON_TMP/go.mod"; then
        echo "" >> "$ERIGON_TMP/go.mod"
        echo "replace github.com/Giulio2002/pq-eth-precompiles/go => ./ntt_local" >> "$ERIGON_TMP/go.mod"
    fi

    echo "[chain] Building Docker image..."
    # Always use our local Dockerfile.pq (simplified, uses vendored pre-built libs)
    cp "$SCRIPT_DIR/Dockerfile.pq" "$ERIGON_TMP/Dockerfile.pq"
    docker build --no-cache -t erigon-pq:local -f Dockerfile.pq .
    echo "[chain] Docker image built successfully."
fi

# ── Destroy existing enclave (idempotent) ────────────────────────────────────

echo "[chain] Removing existing '$ENCLAVE_NAME' enclave (if any)..."
kurtosis enclave rm -f "$ENCLAVE_NAME" 2>/dev/null || true

# ── Start Kurtosis devnet ────────────────────────────────────────────────────

echo "[chain] Starting Kurtosis devnet with Erigon PQ + Prysm..."
kurtosis run --enclave "$ENCLAVE_NAME" github.com/ethpandaops/ethereum-package \
    --args-file "$SCRIPT_DIR/network_params.yaml"

# ── Extract RPC URL ──────────────────────────────────────────────────────────

echo "[chain] Extracting EL RPC URL..."

# Try common service naming patterns for erigon+prysm
RPC_PORT=""
for SERVICE_PATTERN in "el-1-erigon-prysm" "el-1-erigon-lighthouse" "el-1-erigon"; do
    RPC_PORT=$(kurtosis port print "$ENCLAVE_NAME" "$SERVICE_PATTERN" ws-rpc 2>/dev/null || true)
    if [ -n "$RPC_PORT" ]; then
        echo "[chain] Found RPC via service: $SERVICE_PATTERN"
        break
    fi
done

# Fallback: parse enclave inspection for the RPC port
if [ -z "$RPC_PORT" ]; then
    echo "[chain] Trying to extract RPC from enclave inspection..."
    RPC_PORT=$(kurtosis enclave inspect "$ENCLAVE_NAME" 2>&1 | grep -E "rpc.*8545" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+' | head -1 || true)
    if [ -z "$RPC_PORT" ]; then
        # Try another pattern — look for any port mapped to 8545
        RPC_PORT=$(kurtosis enclave inspect "$ENCLAVE_NAME" 2>&1 | grep "8545" | grep -oE '127\.0\.0\.1:[0-9]+' | head -1 || true)
    fi
fi

if [ -z "$RPC_PORT" ]; then
    echo "ERROR: Could not extract RPC URL from Kurtosis enclave."
    echo "[chain] Enclave inspection:"
    kurtosis enclave inspect "$ENCLAVE_NAME" 2>&1 | head -40
    exit 1
fi

# Ensure URL has http:// prefix
if [[ "$RPC_PORT" != http* ]]; then
    RPC_URL="http://$RPC_PORT"
else
    RPC_URL="$RPC_PORT"
fi

echo "$RPC_URL" > "$SCRIPT_DIR/rpc_url.txt"
echo "[chain] RPC URL: $RPC_URL (written to chain/rpc_url.txt)"

# ── Wait for chain to produce blocks ────────────────────────────────────────

echo "[chain] Waiting for chain to produce blocks (up to 120s)..."

TIMEOUT=120
ELAPSED=0
INTERVAL=3

while [ $ELAPSED -lt $TIMEOUT ]; do
    RESULT=$(curl -s --max-time 5 -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' 2>/dev/null || echo "")

    if [ -n "$RESULT" ]; then
        BLOCK_NUM=$(echo "$RESULT" | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    print(int(r.get('result', '0x0'), 16))
except:
    print(0)
" 2>/dev/null || echo "0")

        if [ "$BLOCK_NUM" -gt 0 ] 2>/dev/null; then
            echo "[chain] Chain is producing blocks. Current block: $BLOCK_NUM"
            break
        fi
    fi

    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
    echo "[chain] Waiting... ($ELAPSED/${TIMEOUT}s)"
done

if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "ERROR: Chain did not start producing blocks within ${TIMEOUT}s."
    exit 1
fi

# ── Verify pre-funded accounts ──────────────────────────────────────────────

echo "[chain] Verifying pre-funded accounts..."

ACCOUNTS=(
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266:Deployer"
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8:Payer"
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC:Liquidity"
)

ALL_FUNDED=true
for ENTRY in "${ACCOUNTS[@]}"; do
    ADDR="${ENTRY%%:*}"
    ROLE="${ENTRY##*:}"

    FUNDED=$(curl -s --max-time 5 -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDR\",\"latest\"],\"id\":1}" \
        | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    bal = int(r.get('result', '0x0'), 16)
    eth = bal / 10**18
    if bal > 0:
        print(f'OK {eth:.0f}')
    else:
        print('FAIL')
except:
    print('FAIL')
" 2>/dev/null || echo "FAIL")

    if [[ "$FUNDED" == OK* ]]; then
        ETH="${FUNDED#OK }"
        echo "[chain] OK: $ROLE ($ADDR) has ${ETH} ETH"
    else
        echo "[chain] WARN: $ROLE ($ADDR) has 0 balance"
        ALL_FUNDED=false
    fi
done

if [ "$ALL_FUNDED" = false ]; then
    echo "[chain] WARNING: Some accounts are not funded. The chain may need more time."
fi

# ── Success ──────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  PQ Ethereum Devnet is RUNNING"
echo "  RPC URL: $RPC_URL"
echo "  Enclave: $ENCLAVE_NAME"
echo ""
echo "  Test precompiles: bash chain/test_precompiles.sh"
echo "  Stop devnet:      bash chain/stop.sh"
echo "════════════════════════════════════════════════════════════════"
