# Contracts Agent

## Your Responsibility

Build all Solidity smart contracts for the post-quantum wallet demo. You own the `contracts/` directory.
**Do not touch** `chain/`, `backend/`, or `frontend/`.

---

## What to Build

Use Foundry (`forge`). Create a complete Foundry project in `contracts/`.

```bash
cd contracts
forge init --no-git .
```

### 1. PQSmartWallet (`src/PQSmartWallet.sol`)

The core smart wallet contract. Supports both fresh deployment (via factory) and EIP-7702 delegation (via `initialize`).

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PQSmartWallet {
    bytes public publicKey;
    uint8 public algorithm;     // 0 = Falcon Direct, 1 = Dilithium Direct, 2 = Falcon NTT, 3 = Dilithium NTT
    address public verifier;    // NTT verifier contract address (only for algorithms 2,3; zero for 0,1)
    uint256 public nonce;
    address public payer;       // backend relayer authorized to call execute
    bool public initialized;

    address constant FALCON_VERIFY = address(0x17);
    address constant DILITHIUM_VERIFY = address(0x1b);

    event Executed(address indexed to, uint256 value, uint256 nonce);
    event Initialized(bytes publicKey, uint8 algorithm, address payer);

    /// @notice Initialize wallet (used for both factory deployment and EIP-7702 migration)
    /// @dev Can only be called once. For factory deployment, called by factory in the constructor.
    ///      For EIP-7702, called by the EOA after setting code delegation.
    /// @param _algorithm 0=Falcon Direct, 1=Dilithium Direct, 2=Falcon NTT, 3=Dilithium NTT
    /// @param _verifier Address of NTT verifier contract (required for algorithms 2,3; pass address(0) for 0,1)
    function initialize(bytes calldata _publicKey, uint8 _algorithm, address _payer, address _verifier) external {
        require(!initialized, "Already initialized");
        require(_algorithm <= 3, "Invalid algorithm");
        require(_publicKey.length > 0, "Empty public key");
        // Validate key sizes: Falcon pk = 897 bytes, Dilithium pk = 1312 bytes
        // Algorithms 0,2 are Falcon variants; 1,3 are Dilithium variants
        if (_algorithm == 0 || _algorithm == 2) {
            require(_publicKey.length == 897, "Falcon-512 public key must be 897 bytes");
        } else {
            require(_publicKey.length == 1312, "ML-DSA-44 public key must be 1312 bytes");
        }
        // NTT variants require a verifier contract address
        if (_algorithm >= 2) {
            require(_verifier != address(0), "NTT verifier address required");
        }
        publicKey = _publicKey;
        algorithm = _algorithm;
        verifier = _verifier;
        payer = _payer;
        initialized = true;
        emit Initialized(_publicKey, _algorithm, _payer);
    }

    /// @notice Execute a single call, verified by PQ signature
    /// @param to Target address
    /// @param value ETH value to send
    /// @param data Calldata for the target
    /// @param signature PQ signature over keccak256(abi.encodePacked(to, value, data, nonce, chainId))
    function execute(
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata signature
    ) external {
        require(initialized, "Not initialized");
        require(msg.sender == payer, "Only payer");

        bytes32 msgHash = keccak256(abi.encodePacked(to, value, data, nonce, block.chainid));
        require(_verify(abi.encodePacked(msgHash), signature), "Invalid PQ signature");

        nonce++;
        emit Executed(to, value, nonce - 1);

        (bool ok,) = to.call{value: value}(data);
        require(ok, "Execution failed");
    }

    /// @notice Execute a batch of calls atomically, verified by single PQ signature
    /// @param targets Array of target addresses
    /// @param values Array of ETH values
    /// @param datas Array of calldata
    /// @param signature PQ signature over keccak256(abi.encode(targets, values, datas, nonce, chainId))
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata datas,
        bytes calldata signature
    ) external {
        require(initialized, "Not initialized");
        require(msg.sender == payer, "Only payer");
        require(targets.length == values.length && values.length == datas.length, "Length mismatch");

        bytes32 msgHash = keccak256(abi.encode(targets, values, datas, nonce, block.chainid));
        require(_verify(abi.encodePacked(msgHash), signature), "Invalid PQ signature");

        nonce++;

        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok,) = targets[i].call{value: values[i]}(datas[i]);
            require(ok, "Batch call failed");
        }
    }

    /// @notice Verify a PQ signature using the appropriate method
    /// @dev For Direct variants (0,1): calls the precompile directly
    ///      For NTT variants (2,3): calls the deployed Yul verifier contract
    ///      Input format: abi.encodePacked(publicKey, message, signature)
    ///      Output: 32 bytes, value 1 = valid, 0 = invalid
    ///      IMPORTANT: Check the exact encoding against the Yul verifiers in
    ///      github.com/Giulio2002/pq-eth-precompiles before finalizing.
    function _verify(bytes memory message, bytes calldata signature) internal view returns (bool) {
        address target;

        if (algorithm == 0) {
            target = FALCON_VERIFY;          // Direct: precompile 0x17
        } else if (algorithm == 1) {
            target = DILITHIUM_VERIFY;       // Direct: precompile 0x1b
        } else {
            target = verifier;               // NTT: deployed Yul verifier contract
        }

        bytes memory input = abi.encodePacked(publicKey, message, signature);
        (bool ok, bytes memory result) = target.staticcall(input);

        if (!ok || result.length < 32) return false;
        return uint256(bytes32(result)) == 1;
    }

    /// @notice Accept ETH deposits
    receive() external payable {}
}
```

**CRITICAL**: The `_verify` function's input encoding (how `publicKey`, `message`, and `signature` are concatenated) must match exactly what the precompiles/verifiers expect. You MUST:
1. Clone `github.com/Giulio2002/pq-eth-precompiles` into `/tmp/pq-eth-precompiles`
2. Read the Yul verifier contracts: `FalconVerifierDirectVerify`, `FalconVerifierNTT`, `DilithiumVerifierNTT`
3. Confirm the exact byte layout for both direct and NTT paths
4. Deploy the `FalconVerifierNTT` and `DilithiumVerifierNTT` Yul contracts from that repo — they are the NTT verifiers that the wallet calls for algorithms 2 and 3

The encoding shown above (`abi.encodePacked(publicKey, message, signature)`) is the expected format but MUST be verified against the reference implementation.

### 2. PQWalletFactory (`src/PQWalletFactory.sol`)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQSmartWallet.sol";

contract PQWalletFactory {
    address public falconNTTVerifier;      // deployed FalconVerifierNTT Yul contract
    address public dilithiumNTTVerifier;   // deployed DilithiumVerifierNTT Yul contract

    event WalletCreated(address indexed wallet, address indexed owner, uint8 algorithm);

    constructor(address _falconNTTVerifier, address _dilithiumNTTVerifier) {
        falconNTTVerifier = _falconNTTVerifier;
        dilithiumNTTVerifier = _dilithiumNTTVerifier;
    }

    /// @notice Deploy a new PQ smart wallet
    /// @param publicKey The user's PQ public key (897 bytes for Falcon variants, 1312 for Dilithium variants)
    /// @param algorithm 0=Falcon Direct, 1=Dilithium Direct, 2=Falcon NTT, 3=Dilithium NTT
    /// @param payer Backend address authorized to relay transactions
    /// @return wallet Address of the deployed wallet
    function createWallet(
        bytes calldata publicKey,
        uint8 algorithm,
        address payer
    ) external returns (address wallet) {
        address verifier = _resolveVerifier(algorithm);
        PQSmartWallet w = new PQSmartWallet();
        w.initialize(publicKey, algorithm, payer, verifier);
        wallet = address(w);
        emit WalletCreated(wallet, msg.sender, algorithm);
    }

    /// @notice Deploy with CREATE2 for deterministic addresses
    function createWalletDeterministic(
        bytes calldata publicKey,
        uint8 algorithm,
        address payer,
        bytes32 salt
    ) external returns (address wallet) {
        address verifier = _resolveVerifier(algorithm);
        PQSmartWallet w = new PQSmartWallet{salt: salt}();
        w.initialize(publicKey, algorithm, payer, verifier);
        wallet = address(w);
        emit WalletCreated(wallet, msg.sender, algorithm);
    }

    /// @notice Predict CREATE2 address before deployment
    function predictAddress(bytes32 salt) external view returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(type(PQSmartWallet).creationCode)
        )))));
    }

    function _resolveVerifier(uint8 algorithm) internal view returns (address) {
        if (algorithm == 2) return falconNTTVerifier;
        if (algorithm == 3) return dilithiumNTTVerifier;
        return address(0); // Direct variants don't need a verifier contract
    }
}
```

### 3. USD Stablecoin (`src/USD.sol`)

Simple mintable ERC-20 stablecoin for the demo pool.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract USD is ERC20, Ownable {
    constructor() ERC20("USD Stablecoin", "USD") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

### 4. WETH9 (`src/v3/WETH9.sol`) — compiled at Solidity 0.7.6

Minimal WETH9 required by Uniswap V3 periphery:

```solidity
// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;

contract WETH9 {
    string public name     = "Wrapped Ether";
    string public symbol   = "WETH";
    uint8  public decimals = 18;

    event Approval(address indexed src, address indexed guy, uint wad);
    event Transfer(address indexed src, address indexed dst, uint wad);
    event Deposit(address indexed dst, uint wad);
    event Withdrawal(address indexed src, uint wad);

    mapping (address => uint) public balanceOf;
    mapping (address => mapping (address => uint)) public allowance;

    receive() external payable { deposit(); }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint wad) public {
        require(balanceOf[msg.sender] >= wad);
        balanceOf[msg.sender] -= wad;
        msg.sender.transfer(wad);
        emit Withdrawal(msg.sender, wad);
    }

    function totalSupply() public view returns (uint) {
        return address(this).balance;
    }

    function approve(address guy, uint wad) public returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint wad) public returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint wad) public returns (bool) {
        require(balanceOf[src] >= wad);
        if (src != msg.sender && allowance[src][msg.sender] != uint(-1)) {
            require(allowance[src][msg.sender] >= wad);
            allowance[src][msg.sender] -= wad;
        }
        balanceOf[src] -= wad;
        balanceOf[dst] += wad;
        emit Transfer(src, dst, wad);
        return true;
    }
}
```

### 5. Uniswap V3 — ETH-USD Pool

Install V3 as Foundry dependencies:

```bash
forge install Uniswap/v3-core --no-commit
forge install Uniswap/v3-periphery --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

Update `foundry.toml` with two profiles:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.20"
optimizer = true
optimizer_runs = 200
via_ir = true
remappings = [
  "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
  "@uniswap/v3-core/=lib/v3-core/",
  "@uniswap/v3-periphery/=lib/v3-periphery/",
]

[profile.v3]
src = "src/v3"
out = "out/v3"
solc = "0.7.6"
optimizer = true
optimizer_runs = 200
remappings = [
  "@uniswap/v3-core/=lib/v3-core/",
  "@uniswap/v3-periphery/=lib/v3-periphery/",
]
```

**Uniswap V3 contracts to deploy** (from library imports):
1. `UniswapV3Factory` — `@uniswap/v3-core/contracts/UniswapV3Factory.sol`
2. `SwapRouter` — `@uniswap/v3-periphery/contracts/SwapRouter.sol`
3. `NonfungiblePositionManager` — `@uniswap/v3-periphery/contracts/NonfungiblePositionManager.sol`
4. `QuoterV2` — `@uniswap/v3-periphery/contracts/lens/QuoterV2.sol`

**Pool**: WETH-USD, 3000 fee tier (0.3%), initialized at $2,000/ETH, seeded with ~100 WETH + ~200,000 USD full-range liquidity.

### 6. Deploy Script (`script/Deploy.s.sol`)

A Forge script that deploys everything:

1. Deploy `FalconVerifierNTT` and `DilithiumVerifierNTT` Yul contracts (from `/tmp/pq-eth-precompiles` — clone it first)
2. Deploy `PQSmartWallet` implementation (not initialized — just the bytecode)
3. Deploy `PQWalletFactory(falconNTTVerifier, dilithiumNTTVerifier)`
4. Deploy `USD` stablecoin
5. Mint 500,000 USD to the deployer (for pool liquidity)
6. Write `deployments.json` with all addresses including NTT verifier addresses

**NTT Verifier Deployment**: The FalconVerifierNTT and DilithiumVerifierNTT are Yul contracts from the `pq-eth-precompiles` repo. Clone the repo, compile the Yul, and deploy the bytecode. These are the contracts that perform step-by-step PQ verification using the building-block precompiles.

**Uniswap V3 deployment** should be in a separate script (`script/DeployV3.s.sol`) compiled under `[profile.v3]`:

1. Deploy `WETH9`
2. Deploy `UniswapV3Factory`
3. Deploy `SwapRouter(factory, weth9)`
4. Deploy `NonfungiblePositionManager(factory, weth9, tokenDescriptor)`
5. Deploy `QuoterV2(factory, weth9)`
6. Create WETH-USD pool via `factory.createPool(weth, usd, 3000)`
7. Write `deployments.v3.json`

**Seed Liquidity** script (`script/SeedPool.s.sol`):

1. Initialize pool with sqrtPriceX96 for $2,000/ETH
2. Wrap 100 ETH into WETH
3. Approve WETH and USD to NonfungiblePositionManager
4. Add full-range liquidity (tickLower = -887220, tickUpper = 887220) with 100 WETH + 200,000 USD
5. Verify pool has liquidity by querying slot0

**sqrtPriceX96 calculation for $2,000/ETH**:
- If token0 = WETH, token1 = USD: price = 2000, sqrtPriceX96 = sqrt(2000) * 2^96
- If token0 = USD, token1 = WETH: price = 1/2000, sqrtPriceX96 = sqrt(1/2000) * 2^96
- **CRITICAL**: Check `pool.token0()` to determine ordering. Uniswap V3 always sorts tokens by address (lower = token0).

### 7. Deploy Helper (`contracts/deploy.sh`)

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RPC=${RPC_URL:-$(cat "$SCRIPT_DIR/../chain/rpc_url.txt" 2>/dev/null || echo "http://localhost:8545")}
KEY=${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

echo "[deploy] Using RPC: $RPC"

echo "[deploy] Deploying core contracts (PQ wallets + USD)..."
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" --private-key "$KEY" --broadcast --legacy

echo "[deploy] Deploying Uniswap V3 + WETH + pool..."
FOUNDRY_PROFILE=v3 forge script script/DeployV3.s.sol:DeployV3 \
  --rpc-url "$RPC" --private-key "$KEY" --broadcast --legacy

echo "[deploy] Merging deployment files..."
python3 -c "
import json
core = json.load(open('deployments.json'))
v3 = json.load(open('deployments.v3.json'))
core.update(v3)
json.dump(core, open('../deployments.json', 'w'), indent=2)
print('Merged deployments.json written to repo root.')
"

echo "[deploy] Seeding ETH-USD pool liquidity..."
forge script script/SeedPool.s.sol:SeedPool \
  --rpc-url "$RPC" --private-key "$KEY" --broadcast --legacy

echo "[deploy] Done."
cat ../deployments.json
```

### 8. POOL_INIT_CODE_HASH Patch

The `v3-periphery/contracts/libraries/PoolAddress.sol` has a hardcoded `POOL_INIT_CODE_HASH` that does NOT match locally compiled `UniswapV3Pool` bytecode. The `deploy.sh` must:

1. Compile V3 core first: `FOUNDRY_PROFILE=v3 forge build`
2. Compute actual hash: `cast keccak $(jq -r '.bytecode.object' out/v3/UniswapV3Pool.sol/UniswapV3Pool.json)`
3. Patch `PoolAddress.sol` with the correct hash
4. Rebuild V3 periphery

Without this patch, `SwapRouter`, `NonfungiblePositionManager`, and `QuoterV2` will compute wrong pool addresses and all swaps will revert silently.

### 9. Tests

Write Forge tests for:

**`test/PQSmartWallet.t.sol`**:
- `initialize()` works and sets all fields correctly
- `initialize()` reverts on second call
- `initialize()` reverts with wrong key size
- `execute()` reverts if not initialized
- `execute()` reverts if caller is not payer
- `execute()` correctly forwards ETH
- `executeBatch()` executes multiple calls atomically
- Nonce increments on each execute
- Wallet can receive ETH via `receive()`
- Note: PQ signature verification cannot be tested without the actual precompiles — mock the precompile response or skip verification tests (they'll work end-to-end on the PQ chain)

**`test/PQWalletFactory.t.sol`**:
- `createWallet()` deploys and initializes a wallet
- `createWalletDeterministic()` produces predicted address
- `WalletCreated` event emitted correctly
- Multiple wallets can be deployed

**`test/USD.t.sol`**:
- Mint works for owner
- Mint reverts for non-owner
- Transfer and approve work

### 10. `contracts/README.md`

Document:
- Prerequisites: Foundry installed
- Build: `forge build && FOUNDRY_PROFILE=v3 forge build`
- Test: `forge test -v`
- Deploy: `./deploy.sh` (requires running chain)

## File Structure

```
contracts/
  foundry.toml
  deploy.sh
  README.md
  src/
    PQSmartWallet.sol
    PQWalletFactory.sol
    USD.sol
    v3/
      WETH9.sol                 (0.7.6)
  script/
    Deploy.s.sol                (core contracts, 0.8.20)
    DeployV3.s.sol              (V3 + WETH + pool creation, 0.7.6)
    SeedPool.s.sol              (initialize pool + add liquidity, 0.8.20)
  test/
    PQSmartWallet.t.sol
    PQWalletFactory.t.sol
    USD.t.sol
  lib/                          (forge install targets)
deployments.json                (local, for V3 script output)
deployments.v3.json             (local, merged into root deployments.json)
```

Final `../deployments.json` schema (at repo root):

```json
{
  "chainId": 3151908,
  "PQWalletFactory": "0x...",
  "PQSmartWalletImpl": "0x...",
  "FalconVerifierNTT": "0x...",
  "DilithiumVerifierNTT": "0x...",
  "WETH9": "0x...",
  "USD": "0x...",
  "UniswapV3Factory": "0x...",
  "SwapRouter": "0x...",
  "NonfungiblePositionManager": "0x...",
  "QuoterV2": "0x...",
  "ETH_USD_Pool": "0x...",
  "payerAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
}
```

## Important Notes

- Install deps: `forge install OpenZeppelin/openzeppelin-contracts Uniswap/v3-core Uniswap/v3-periphery --no-commit`
- `deployments.json` goes at **repo root** — all agents read from there
- `forge build` must exit 0 for BOTH profiles (default + v3)
- `forge test` must exit 0
- The POOL_INIT_CODE_HASH patch is MANDATORY — without it, all Uniswap operations silently fail
- Uniswap V3 pool token ordering is by address sort (lower = token0) — sqrtPriceX96 must account for this
- PQ signature tests cannot run on standard EVM (no precompiles) — test the contract logic (access control, nonce, forwarding) separately from verification
- The `SwapRouter.exactInputSingle` struct includes a `deadline` field — the struct order is `(tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96)` with selector `0x414bf389`
- For `SeedPool.s.sol`, add `via_ir = true` to `[profile.default]` in `foundry.toml` to handle stack depth
