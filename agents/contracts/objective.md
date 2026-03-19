# Contracts Agent — Success Criteria

## One-sentence goal

Build a Foundry project with PQ smart wallet contracts supporting 4 verification modes (Falcon Direct, Dilithium Direct, Falcon NTT, Dilithium NTT), deployed NTT Yul verifiers from pq-eth-precompiles, a wallet factory, a USD stablecoin, and a Uniswap V3 ETH-USD pool with seeded liquidity — all compiling, tested, and deployable.

---

## Verification Commands

### 1. Build succeeds (both profiles)

```bash
cd contracts
forge build 2>&1
echo "Default profile exit code: $?"
FOUNDRY_PROFILE=v3 forge build 2>&1
echo "V3 profile exit code: $?"
# Both must exit 0
```

### 2. All tests pass

```bash
cd contracts
forge test -v 2>&1
echo "Exit code: $?"
# Must exit 0, no test failures
```

### 3. PQSmartWallet tests — functional correctness

```bash
cd contracts
forge test --match-contract PQSmartWallet -vv 2>&1 | grep -E "(PASS|FAIL|Error)"
# Expected: all PASS
```

Must test:
- `initialize()` succeeds and sets fields for all 4 algorithm types (0,1,2,3)
- Double `initialize()` reverts
- Wrong key size reverts (Falcon key for Dilithium algorithm and vice versa)
- NTT algorithms (2,3) revert if verifier address is zero
- Direct algorithms (0,1) accept zero verifier address
- `execute()` reverts when not initialized
- `execute()` reverts when caller is not payer
- ETH forwarding via `execute()`
- `executeBatch()` multi-call execution
- Nonce increments
- `receive()` accepts ETH

### 4. PQWalletFactory tests

```bash
cd contracts
forge test --match-contract PQWalletFactory -vv 2>&1 | grep -E "(PASS|FAIL|Error)"
```

Must test:
- `createWallet()` deploys and initializes
- `createWalletDeterministic()` matches `predictAddress()`
- `WalletCreated` event emitted

### 5. USD token tests

```bash
cd contracts
forge test --match-contract USD -vv 2>&1 | grep -E "(PASS|FAIL|Error)"
```

### 6. Deploy script runs against chain

```bash
# Assumes chain is running, RPC available
RPC_URL=$(cat chain/rpc_url.txt 2>/dev/null || echo "http://localhost:8545")

cd contracts
RPC_URL="$RPC_URL" bash deploy.sh 2>&1
echo "Exit code: $?"

# deployments.json at repo root
test -f ../deployments.json && echo "OK: deployments.json exists" || echo "FAIL"

python3 -c "
import json
d = json.load(open('../deployments.json'))
for key in ['PQWalletFactory', 'PQSmartWalletImpl', 'FalconVerifierNTT',
            'DilithiumVerifierNTT', 'WETH9', 'USD',
            'UniswapV3Factory', 'SwapRouter', 'NonfungiblePositionManager',
            'QuoterV2', 'ETH_USD_Pool', 'payerAddress']:
    assert key in d, f'Missing key: {key}'
    assert d[key].startswith('0x'), f'Bad address for {key}: {d[key]}'
print('OK: all required addresses present')
print(json.dumps(d, indent=2))
"
```

### 7. Pool has liquidity

```bash
RPC_URL=$(cat chain/rpc_url.txt 2>/dev/null || echo "http://localhost:8545")
python3 -c "
import subprocess, json

d = json.load(open('deployments.json'))
pool = d['ETH_USD_Pool']
rpc = '${RPC_URL}'

def eth_call(to, data):
    r = subprocess.run(['curl', '-s', '-X', 'POST', rpc,
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({'jsonrpc':'2.0','method':'eth_call',
                         'params':[{'to': to, 'data': data}, 'latest'],'id':1})],
        capture_output=True, text=True)
    return json.loads(r.stdout).get('result', '0x')

# Check slot0 — sqrtPriceX96 should be non-zero if initialized
slot0 = eth_call(pool, '0x3850c7bd')
sqrt_price = int(slot0[:66], 16) if len(slot0) >= 66 else 0
assert sqrt_price > 0, f'Pool not initialized: sqrtPriceX96 = {sqrt_price}'

# Check liquidity
liquidity = eth_call(pool, '0x1a686502')
liq = int(liquidity, 16)
assert liq > 0, f'Pool has no liquidity: {liq}'
print(f'OK: Pool initialized (sqrtPriceX96={sqrt_price}, liquidity={liq})')
"
```

### 8. ETH-USD price is reasonable

```bash
RPC_URL=$(cat chain/rpc_url.txt 2>/dev/null || echo "http://localhost:8545")
python3 -c "
import subprocess, json

d = json.load(open('deployments.json'))
pool = d['ETH_USD_Pool']
weth = d['WETH9']
rpc = '${RPC_URL}'

def eth_call(to, data):
    r = subprocess.run(['curl', '-s', '-X', 'POST', rpc,
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({'jsonrpc':'2.0','method':'eth_call',
                         'params':[{'to': to, 'data': data}, 'latest'],'id':1})],
        capture_output=True, text=True)
    return json.loads(r.stdout).get('result', '0x')

# Get token0
t0 = '0x' + eth_call(pool, '0x0dfe1681')[26:]  # token0()
slot0 = eth_call(pool, '0x3850c7bd')
sqrt = int(slot0[:66], 16)
price = (sqrt / 2**96) ** 2

# If token0 is WETH, price is USD/WETH (should be ~2000)
# If token0 is USD, price is WETH/USD (should be ~0.0005), so invert
if t0.lower() != weth.lower():
    price = 1 / price if price > 0 else 0

assert 500 < price < 10000, f'ETH-USD price unreasonable: \${price:.2f}'
print(f'OK: ETH-USD price = \${price:.2f}')
"
```

### 9. File presence check

```bash
for F in \
  contracts/src/PQSmartWallet.sol \
  contracts/src/PQWalletFactory.sol \
  contracts/src/USD.sol \
  contracts/src/v3/WETH9.sol \
  contracts/script/Deploy.s.sol \
  contracts/script/DeployV3.s.sol \
  contracts/script/SeedPool.s.sol \
  contracts/test/PQSmartWallet.t.sol \
  contracts/test/PQWalletFactory.t.sol \
  contracts/test/USD.t.sol \
  contracts/foundry.toml \
  contracts/deploy.sh \
  contracts/README.md; do
  test -f "$F" && echo "OK: $F" || echo "FAIL: $F missing"
done
```

## Success Criteria

- [ ] `forge build` exits 0 (default profile, no compilation errors)
- [ ] `FOUNDRY_PROFILE=v3 forge build` exits 0 (V3 profile)
- [ ] `forge test` exits 0 (all tests pass)
- [ ] PQSmartWallet: initialize (all 4 algorithm types), access control, execute, executeBatch, nonce, receive all tested
- [ ] FalconVerifierNTT and DilithiumVerifierNTT Yul contracts deployed (from pq-eth-precompiles repo)
- [ ] PQWalletFactory: createWallet, deterministic creation, event emission tested
- [ ] USD: mint, ownership, transfer tested
- [ ] `deploy.sh` runs against chain and writes `deployments.json` to repo root
- [ ] `deployments.json` contains all required addresses (PQWalletFactory, PQSmartWalletImpl, FalconVerifierNTT, DilithiumVerifierNTT, WETH9, USD, V3 infra, ETH_USD_Pool, payerAddress)
- [ ] POOL_INIT_CODE_HASH is patched correctly (SwapRouter resolves correct pool addresses)
- [ ] ETH-USD pool is initialized with a price around $2,000/ETH
- [ ] ETH-USD pool has seeded liquidity (liquidity > 0)
- [ ] All source files present and compiling
- [ ] `deploy.sh` is executable

## Known Gotchas

### POOL_INIT_CODE_HASH
The `v3-periphery/contracts/libraries/PoolAddress.sol` has a hardcoded hash that does NOT match locally compiled UniswapV3Pool bytecode. `deploy.sh` must auto-compute and patch it before deploying periphery. Without this, SwapRouter/NonfungiblePositionManager compute wrong pool addresses and all swaps revert silently.

### SwapRouter deadline field
The deployed `SwapRouter.exactInputSingle` struct order is: `(tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96)`. Selector: `0x414bf389`. Missing `deadline` causes silent reverts.

### Pool token ordering
Uniswap V3 sorts tokens by address (lower = token0). If token0 is USD rather than WETH, the sqrtPriceX96 must be inverted. Always check `pool.token0()`.

### via_ir = true
`SeedPool.s.sol` may exceed stack depth without IR-based code generation. Add `via_ir = true` to `[profile.default]`.

### PQ verification on standard EVM
PQ precompiles only exist on the Erigon PQ chain. Tests running on Forge's default EVM cannot test actual PQ signature verification. Test everything else (access control, nonce, forwarding, events) and rely on end-to-end testing on the actual chain for PQ verification.
