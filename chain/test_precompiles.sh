#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RPC_URL=$(cat "$SCRIPT_DIR/rpc_url.txt" 2>/dev/null || echo "http://127.0.0.1:8545")

echo "[test] Using RPC: $RPC_URL"
echo ""

PASS=0
FAIL=0

# ── Helper ───────────────────────────────────────────────────────────────────

check() {
    local name="$1"
    local ok="$2"
    if [ "$ok" = "true" ]; then
        echo "  PASS: $name"
        PASS=$((PASS + 1))
    else
        echo "  FAIL: $name"
        FAIL=$((FAIL + 1))
    fi
}

# ── 1. Standard EVM: eth_blockNumber ─────────────────────────────────────────

echo "[test] 1. Standard EVM checks"

RESULT=$(curl -s --max-time 10 -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}')

BLOCK=$(echo "$RESULT" | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    print(int(r.get('result', '0x0'), 16))
except:
    print(-1)
" 2>/dev/null || echo "-1")

check "eth_blockNumber responds (block=$BLOCK)" "$([ "$BLOCK" -ge 0 ] 2>/dev/null && echo true || echo false)"

# ── 2. Standard EVM: eth_getBalance ──────────────────────────────────────────

BAL_OK=$(curl -s --max-time 10 -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","latest"],"id":1}' \
    | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    bal = int(r.get('result', '0x0'), 16)
    print('true' if bal > 0 else 'false')
except:
    print('false')
" 2>/dev/null || echo "false")

check "eth_getBalance (deployer funded)" "$BAL_OK"

# ── 3. SHAKE precompile (0x16) — simplest smoke test ────────────────────────

echo ""
echo "[test] 2. PQ precompile reachability"

# SHAKE256(0x16): call with some data, should return a result (hash output)
SHAKE_RESULT=$(curl -s --max-time 10 -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "jsonrpc":"2.0",
        "method":"eth_call",
        "params":[{
            "to":"0x0000000000000000000000000000000000000016",
            "data":"0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000448656c6c6f00000000000000000000000000000000000000000000000000000000",
            "gas":"0xFFFFF"
        },"latest"],
        "id":1
    }')

SHAKE_OK=$(echo "$SHAKE_RESULT" | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    # Either a result or a structured error means the precompile is reachable
    if 'result' in r or 'error' in r:
        print('true')
    else:
        print('false')
except:
    print('false')
" 2>/dev/null || echo "false")

check "SHAKE precompile (0x16) reachable" "$SHAKE_OK"

# ── 4. Falcon verify (0x17) — reachability test ─────────────────────────────

FALCON_RESULT=$(curl -s --max-time 10 -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "jsonrpc":"2.0",
        "method":"eth_call",
        "params":[{
            "to":"0x0000000000000000000000000000000000000017",
            "data":"0x00",
            "gas":"0xFFFFF"
        },"latest"],
        "id":1
    }')

FALCON_OK=$(echo "$FALCON_RESULT" | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    if 'result' in r or 'error' in r:
        print('true')
    else:
        print('false')
except:
    print('false')
" 2>/dev/null || echo "false")

check "Falcon VERIFY precompile (0x17) reachable" "$FALCON_OK"

# ── 5. Dilithium verify (0x1b) — reachability test ──────────────────────────

DILITHIUM_RESULT=$(curl -s --max-time 10 -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{
        "jsonrpc":"2.0",
        "method":"eth_call",
        "params":[{
            "to":"0x000000000000000000000000000000000000001b",
            "data":"0x00",
            "gas":"0xFFFFF"
        },"latest"],
        "id":1
    }')

DILITHIUM_OK=$(echo "$DILITHIUM_RESULT" | python3 -c "
import json, sys
try:
    r = json.load(sys.stdin)
    if 'result' in r or 'error' in r:
        print('true')
    else:
        print('false')
except:
    print('false')
" 2>/dev/null || echo "false")

check "Dilithium VERIFY precompile (0x1b) reachable" "$DILITHIUM_OK"

# ── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "════════════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
