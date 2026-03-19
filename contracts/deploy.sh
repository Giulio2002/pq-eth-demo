#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RPC=${RPC_URL:-$(cat "$REPO_ROOT/chain/rpc_url.txt" 2>/dev/null || echo "http://localhost:8545")}
KEY=${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

cd "$SCRIPT_DIR"
echo "[deploy] Using RPC: $RPC"

# Helper: deploy bytecode via cast send --create, return contract address
deploy_bytecode() {
    local BYTECODE="$1"
    local LABEL="$2"
    local RESULT=$(cast send --rpc-url "$RPC" --private-key "$KEY" --legacy --json --create "$BYTECODE")
    local ADDR=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['contractAddress'])")
    echo "[deploy] $LABEL: $ADDR" >&2
    echo "$ADDR"
}

# Helper: deploy bytecode with constructor args appended
deploy_bytecode_with_args() {
    local BYTECODE="$1"
    local ARGS="$2"
    local LABEL="$3"
    local RESULT=$(cast send --rpc-url "$RPC" --private-key "$KEY" --legacy --json --create "${BYTECODE}${ARGS}")
    local ADDR=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin)['contractAddress'])")
    echo "[deploy] $LABEL: $ADDR" >&2
    echo "$ADDR"
}

# ── Step 1: Build + deploy core contracts (PQ wallets + USD) ──
echo "[deploy] Building default profile contracts..."
forge build

echo "[deploy] Deploying core contracts (PQ wallets + USD)..."
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --private-key "$KEY" --broadcast --legacy

echo "[deploy] Core contracts deployed."
cat deployments.json

# ── Step 2: Build V3 Core (in its own directory with optimizer) ──
echo "[deploy] Building Uniswap V3 Core..."
V3_CORE="$SCRIPT_DIR/lib/v3-core"
cat > "$V3_CORE/foundry.toml" << 'EOF'
[profile.default]
src = "contracts"
out = "out"
optimizer = true
optimizer_runs = 200
solc = "0.7.6"
EOF
cd "$V3_CORE" && forge build --force
cd "$SCRIPT_DIR"

# ── Step 3: Deploy WETH9 ──
echo "[deploy] Deploying WETH9..."
FOUNDRY_PROFILE=v3 forge build
WETH9_BYTECODE=$(python3 -c "import json; print(json.load(open('out/v3/WETH9.sol/WETH9.json'))['bytecode']['object'])")
WETH9=$(deploy_bytecode "$WETH9_BYTECODE" "WETH9")

# ── Step 4: Deploy UniswapV3Factory ──
echo "[deploy] Deploying UniswapV3Factory..."
FACTORY_BYTECODE=$(python3 -c "import json; print(json.load(open('$V3_CORE/out/UniswapV3Factory.sol/UniswapV3Factory.json'))['bytecode']['object'])")
FACTORY=$(deploy_bytecode "$FACTORY_BYTECODE" "UniswapV3Factory")

# ── Step 5: Compute POOL_INIT_CODE_HASH and patch PoolAddress.sol ──
echo "[deploy] Computing POOL_INIT_CODE_HASH..."
POOL_BYTECODE=$(python3 -c "import json; print(json.load(open('$V3_CORE/out/UniswapV3Pool.sol/UniswapV3Pool.json'))['bytecode']['object'])")
POOL_HASH=$(cast keccak "$POOL_BYTECODE")
echo "[deploy] POOL_INIT_CODE_HASH: $POOL_HASH"

POOL_ADDR_SOL="$SCRIPT_DIR/lib/v3-periphery/contracts/libraries/PoolAddress.sol"
if [ -f "$POOL_ADDR_SOL" ]; then
    sed -i.bak "s/POOL_INIT_CODE_HASH = bytes32(0x[0-9a-fA-F]*)/POOL_INIT_CODE_HASH = bytes32($POOL_HASH)/" "$POOL_ADDR_SOL"
    rm -f "${POOL_ADDR_SOL}.bak"
    echo "[deploy] Patched PoolAddress.sol"
fi

# ── Step 6: Build V3 Periphery ──
echo "[deploy] Building Uniswap V3 Periphery..."
V3_PERIPHERY="$SCRIPT_DIR/lib/v3-periphery"

# Install base64-sol dependency if missing
if [ ! -d "$V3_PERIPHERY/node_modules/base64-sol" ] && [ ! -d "$V3_PERIPHERY/lib/base64-sol" ]; then
    echo "[deploy] Installing base64-sol..."
    mkdir -p "$V3_PERIPHERY/lib"
    git clone --depth 1 https://github.com/Brechtpd/base64.git "$V3_PERIPHERY/lib/base64-sol" 2>/dev/null || true
fi

cat > "$V3_PERIPHERY/foundry.toml" << EOF
[profile.default]
src = "contracts"
out = "out"
libs = ["lib", "../v3-core", "../openzeppelin-contracts-v3"]
optimizer = true
optimizer_runs = 200
solc = "0.7.6"
skip = ["contracts/V3Migrator.sol", "contracts/NonfungibleTokenPositionDescriptor.sol", "contracts/test/**"]
remappings = [
  "@uniswap/v3-core/=$V3_CORE/",
  "@openzeppelin/contracts/=$SCRIPT_DIR/lib/openzeppelin-contracts-v3/contracts/",
  "base64-sol/=lib/base64-sol/",
]
EOF

cd "$V3_PERIPHERY" && forge build --force 2>&1 | tail -10
cd "$SCRIPT_DIR"

# ── Step 7: Deploy SwapRouter, NFTPositionManager, QuoterV2 ──
echo "[deploy] Deploying SwapRouter..."
SR_BYTECODE=$(python3 -c "import json; print(json.load(open('$V3_PERIPHERY/out/SwapRouter.sol/SwapRouter.json'))['bytecode']['object'])")
# Constructor args: (address factory, address WETH9) — abi-encode them
SR_ARGS=$(cast abi-encode "constructor(address,address)" "$FACTORY" "$WETH9" | sed 's/^0x//')
SWAP_ROUTER=$(deploy_bytecode_with_args "$SR_BYTECODE" "$SR_ARGS" "SwapRouter")

echo "[deploy] Deploying NonfungiblePositionManager..."
NFT_BYTECODE=$(python3 -c "import json; print(json.load(open('$V3_PERIPHERY/out/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'))['bytecode']['object'])")
NFT_ARGS=$(cast abi-encode "constructor(address,address,address)" "$FACTORY" "$WETH9" "0x0000000000000000000000000000000000000000" | sed 's/^0x//')
NFT_MANAGER=$(deploy_bytecode_with_args "$NFT_BYTECODE" "$NFT_ARGS" "NonfungiblePositionManager")

echo "[deploy] Deploying QuoterV2..."
Q_BYTECODE=$(python3 -c "import json; print(json.load(open('$V3_PERIPHERY/out/QuoterV2.sol/QuoterV2.json'))['bytecode']['object'])")
Q_ARGS=$(cast abi-encode "constructor(address,address)" "$FACTORY" "$WETH9" | sed 's/^0x//')
QUOTER=$(deploy_bytecode_with_args "$Q_BYTECODE" "$Q_ARGS" "QuoterV2")

# ── Step 8: Create WETH-USD pool ──
echo "[deploy] Creating WETH-USD pool..."
USD=$(python3 -c "import json; print(json.load(open('deployments.json'))['USD'])")
cast send "$FACTORY" "createPool(address,address,uint24)" "$WETH9" "$USD" 3000 \
  --rpc-url "$RPC" --private-key "$KEY" --legacy > /dev/null
POOL=$(cast call "$FACTORY" "getPool(address,address,uint24)(address)" "$WETH9" "$USD" 3000 --rpc-url "$RPC")
echo "[deploy] ETH_USD_Pool: $POOL"

# ── Step 9: Update deployments.json ──
echo "[deploy] Updating deployments.json..."
python3 << PYEOF
import json
d = json.load(open('deployments.json'))
d['WETH9'] = '$WETH9'
d['UniswapV3Factory'] = '$FACTORY'
d['SwapRouter'] = '$SWAP_ROUTER'
d['NonfungiblePositionManager'] = '$NFT_MANAGER'
d['QuoterV2'] = '$QUOTER'
d['ETH_USD_Pool'] = '$POOL'
d['payerAddress'] = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
json.dump(d, open('deployments.json', 'w'), indent=2)
# Also write to repo root
json.dump(d, open('$REPO_ROOT/deployments.json', 'w'), indent=2)
print('deployments.json updated.')
PYEOF

# ── Step 10: Seed pool liquidity ──
echo "[deploy] Seeding ETH-USD pool liquidity..."
forge script script/SeedPool.s.sol:SeedPool \
  --rpc-url "$RPC" --private-key "$KEY" --broadcast --legacy || {
    echo "[deploy] WARNING: SeedPool script failed. Pool may need manual seeding."
}

echo "[deploy] Done."
cat "$REPO_ROOT/deployments.json"
