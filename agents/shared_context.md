# Post-Quantum Smart Wallet Demo — System Architecture

## What Is This?

A demonstration of post-quantum cryptographic smart wallets on Ethereum, using native EVM precompiles for Falcon-512 and ML-DSA-44 (Dilithium) signature verification. Users generate quantum-resistant keypairs in the browser, deploy smart wallets on-chain, and transact (send ETH, swap via Uniswap) with post-quantum security — the backend never sees the private key.

## Target Directory Structure

You are one of several agents building this demo. Each agent owns a specific subdirectory.
**Do not modify files in other agents' directories.**

```
chain/             — Kurtosis devnet: Erigon (PQ branch) + Prysm               [chain agent]
contracts/         — Solidity: PQ smart wallets, factory, Uniswap V3 pool       [contracts agent]
backend/           — Go: REST API, tx relay, indexer, SQLite                    [backend agent]   ← port 8546
frontend/          — Next.js: wallet UI, PQ key generation via WASM             [frontend agent]  ← port 3000
explorer/          — Next.js: block explorer showing PQ signature schemes       [explorer agent]  ← port 3001
deployments.json   — Contract addresses (written by contracts deploy script)
```

## Post-Quantum Precompiles

The Erigon PQ branch (`docker_pq-precompiles` on `erigontech/erigon`) adds these EVM precompiles:

| Address | Name               | Gas       | Purpose                                    |
|---------|--------------------|-----------|---------------------------------------------|
| 0x12    | NTT_FW             | 600       | Forward Number Theoretic Transform          |
| 0x13    | NTT_INV            | 600       | Inverse NTT with n⁻¹ scaling               |
| 0x14    | VECMULMOD          | variable  | Element-wise modular multiplication         |
| 0x15    | VECADDMOD          | variable  | Element-wise modular addition               |
| 0x16    | SHAKE              | variable  | SHAKE-128/256 extendable output function    |
| **0x17**| **FALCON_VERIFY**  | **2,800** | **Falcon-512 full signature verification**  |
| 0x18    | LP_NORM            | 400       | Centered L2 norm check                      |
| 0x19    | VECSUBMOD          | variable  | Element-wise modular subtraction            |
| 0x1a    | EXPAND_A_VECMUL    | variable  | ExpandA + matrix-vector multiply            |
| **0x1b**| **DILITHIUM_VERIFY**| **~119,000** | **ML-DSA-44 (Dilithium) full verification** |

**Two verification approaches are available for each algorithm:**

1. **Direct Verify** (single precompile call — simpler, purpose-built):
   - **Falcon-512 Direct**: `address(0x17).staticcall(abi.encodePacked(publicKey, message, signature))` — 2,800 gas
   - **Dilithium Direct**: `address(0x1b).staticcall(abi.encodePacked(publicKey, message, signature))` — ~119,000 gas

2. **NTT / Lego Approach** (composite precompile calls via on-chain Yul verifier — modular, transparent):
   - **Falcon-512 NTT**: calls a deployed `FalconVerifierNTT` Yul contract that internally uses precompiles 0x12 (NTT_FW), 0x13 (NTT_INV), 0x14 (VECMULMOD), 0x16 (SHAKE), 0x18 (LP_NORM) step-by-step
   - **Dilithium NTT**: calls a deployed `DilithiumVerifierNTT` Yul contract that internally uses precompiles 0x12, 0x13, 0x14, 0x15, 0x16, 0x1a (EXPAND_A_VECMUL) step-by-step

   The NTT verifiers are Yul contracts from `github.com/Giulio2002/pq-eth-precompiles`. They compose the building-block precompiles like Lego pieces to perform verification transparently — each cryptographic step (NTT transform, polynomial multiplication, norm check, etc.) is a separate precompile call, making the verification process inspectable on-chain.

Both approaches return 32 bytes: value `1` if valid, `0` if invalid.

### Four Wallet Types

| ID | Algorithm | Approach | Verification Method | Gas (approx) |
|----|-----------|----------|-------------------|-------------|
| 0  | Falcon-512 Direct | Direct precompile | `staticcall(0x17)` | ~2,800 |
| 1  | ML-DSA-44 Direct | Direct precompile | `staticcall(0x1b)` | ~119,000 |
| 2  | Falcon-512 NTT | Lego (composite) | `call(FalconVerifierNTT)` | ~5,000+ |
| 3  | ML-DSA-44 NTT | Lego (composite) | `call(DilithiumVerifierNTT)` | ~150,000+ |

Users choose one of these four when creating a wallet. The frontend explains the trade-offs:
- **Direct**: simpler, single precompile call, lower gas, but verification is opaque
- **NTT/Lego**: each cryptographic step is a separate precompile call, making verification transparent and auditable on-chain, at slightly higher gas cost

### Key & Signature Sizes

| Algorithm     | Public Key   | Secret Key   | Signature            |
|---------------|-------------|-------------|----------------------|
| Falcon-512    | 897 bytes   | 1,281 bytes | ≤ 690 bytes (variable) |
| ML-DSA-44     | 1,312 bytes | 2,560 bytes | 2,420 bytes (fixed)  |

Key sizes are the same regardless of whether Direct or NTT verification is used — the difference is only in on-chain verification logic.

### Reference Implementation

The Yul verifier contracts (`FalconVerifierDirectVerify`, `FalconVerifierNTT`, `DilithiumVerifierNTT`) in `github.com/Giulio2002/pq-eth-precompiles` are the authoritative reference for precompile input encoding. The contracts agent MUST clone this repo and use these Yul contracts for the NTT verifiers, and reference their encoding for the direct verify path.

## Smart Wallet Architecture

### PQSmartWallet Contract

Each smart wallet stores:
- `bytes publicKey` — the user's PQ public key
- `uint8 algorithm` — `0` = Falcon Direct, `1` = Dilithium Direct, `2` = Falcon NTT, `3` = Dilithium NTT
- `address verifier` — address of the NTT verifier contract (only for algorithms 2,3; zero for 0,1)
- `uint256 nonce` — replay protection
- `address payer` — backend address authorized to relay transactions
- `bool initialized` — guards against double-init (needed for EIP-7702)

Execution flow:
1. User signs `keccak256(abi.encodePacked(to, value, data, nonce, chainId))` with PQ private key in the browser
2. Frontend sends `{wallet, to, value, data, signature}` to backend
3. Backend calls `wallet.execute(to, value, data, signature)` from the payer account
4. Smart wallet reconstructs the message hash, calls the appropriate precompile to verify, increments nonce, executes the call

The wallet also supports `executeBatch(targets[], values[], datas[], signature)` for atomic multi-step operations (e.g., wrap ETH + approve + swap in one PQ-signed transaction).

### PQWalletFactory Contract

Deploys new PQSmartWallet instances:
- `createWallet(bytes publicKey, uint8 algorithm, address payer) → address`
- For algorithms 2,3 (NTT), automatically sets the verifier address from the factory's stored NTT verifier addresses
- Emits `WalletCreated(address indexed wallet, address indexed owner, uint8 algorithm)`
- Uses CREATE2 for deterministic addresses

### EIP-7702 Migration

Existing EOAs can adopt PQ security without changing their address:
1. User generates PQ keypair in browser
2. EOA signs an EIP-7702 authorization designating the PQSmartWallet implementation as its code delegate
3. Backend submits the 7702 authorization transaction
4. User calls `initialize(publicKey, algorithm, payer)` on their EOA (now acting as smart wallet)
5. From then on, the EOA uses PQ verification for all transactions through `execute()`

## Uniswap V3 ETH-USD Pool

- **WETH9**: standard wrapped ETH
- **USD**: mintable ERC-20 stablecoin (18 decimals, $1 peg)
- **Pool**: WETH-USD, 3000 fee tier (0.3%)
- **Seeded**: ~100 WETH + ~200,000 USD (price: $2,000/ETH)
- **SwapRouter**: for executing swaps
- **NonfungiblePositionManager**: for adding liquidity
- **QuoterV2**: for price quotes

Smart wallets interact via `executeBatch()` calling `WETH.deposit()` + `WETH.approve()` + `SwapRouter.exactInputSingle()` atomically.

## Tech Stack

| Layer      | Technology                                              |
|------------|--------------------------------------------------------|
| Chain      | Erigon (`docker_pq-precompiles`) + Prysm via Kurtosis |
| Contracts  | Solidity 0.8.20 + Foundry, Uniswap V3 (0.7.6)        |
| Backend    | Go 1.22+, SQLite, go-ethereum bindings                 |
| Frontend   | Next.js 14, TypeScript, Rust→WASM (PQ crypto)          |
| Explorer   | Next.js 14, TypeScript — block explorer with PQ badges  |

## Service Ports

| Service          | Port | Description                          |
|------------------|------|--------------------------------------|
| Erigon RPC       | 8545 | Chain JSON-RPC (from Kurtosis)       |
| Backend API      | 8546 | REST + transaction relay             |
| Frontend         | 3000 | Wallet UI                            |
| Explorer         | 3001 | Block explorer with PQ scheme badges |

## Pre-funded Accounts

Kurtosis pre-funds these accounts (standard Hardhat/Anvil test mnemonic):

`test test test test test test test test test test test junk`

| Role      | Address                                      | Private Key                                                          |
|-----------|----------------------------------------------|----------------------------------------------------------------------|
| Deployer  | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266   | 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   |
| Payer     | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8   | 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   |
| Liquidity | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC   | 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a   |

## Contract Addresses (deployments.json)

Written to `deployments.json` at repo root by `contracts/deploy.sh`:

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

## Cross-Agent Data Flow

```
[Browser]                          [Backend :8546]                    [Chain :8545]
   │                                    │                                  │
   ├── PQ keygen (WASM) ──────────→ publicKey stays local                  │
   │                                    │                                  │
   ├── POST /api/wallet/create ────→ deploy PQSmartWallet ──────────→ Factory.createWallet()
   │   {publicKey, algorithm}           │                                  │
   │                                    │                                  │
   ├── PQ sign(msgHash) ──→ signature   │                                  │
   │                                    │                                  │
   ├── POST /api/wallet/execute ───→ relay tx ──────────────────────→ Wallet.execute()
   │   {wallet, to, value, data, sig}   │                              ↓
   │                                    │                          precompile(0x17 or 0x1b)
   │                                    │                              ↓
   │                                    │                          verify PQ signature
   │                                    │                              ↓
   │                                    │                          forward call(to, value, data)
   │                                    │                                  │
   ├── GET /api/wallet/:addr/assets ←── query chain + DB index             │
   │                                    │                                  │
   └── POST /api/wallet/migrate ───→ submit 7702 auth ─────────────→ EOA.initialize()
```

## Required Repository Clones

Agents that need reference code or Docker images MUST clone these repositories:

1. **Erigon PQ branch** — the custom Erigon with PQ precompiles:
   ```bash
   git clone --branch docker_pq-precompiles --depth 1 https://github.com/erigontech/erigon.git /tmp/erigon-pq
   ```
   Used by: chain agent (Docker image build), contracts agent (reference for precompile behavior)

2. **PQ-ETH precompiles** — Rust precompile implementations + Yul verifier contracts:
   ```bash
   git clone --depth 1 https://github.com/Giulio2002/pq-eth-precompiles.git /tmp/pq-eth-precompiles
   ```
   Used by: contracts agent (MUST use the Yul verifier contracts `FalconVerifierNTT`, `FalconVerifierDirectVerify`, `DilithiumVerifierNTT` from this repo for the NTT wallet types and as encoding reference for the direct verify path), frontend agent (reference for key/signature formats), chain agent (reference Kurtosis config if available)

Both repos should be cloned into `/tmp/` to avoid polluting the project directory.

## Important Constraints

- The backend NEVER sees PQ private keys — only public keys
- PQ key generation and signing happen exclusively in the browser (WASM)
- The backend is a relayer/payer: it holds ETH to pay gas on behalf of users
- All PQ signature verification happens on-chain via precompiles (direct or NTT/lego)
- EIP-7702 migration preserves the EOA's address and existing assets
- The Uniswap pool must have real liquidity seeded at deployment time
- Users choose from 4 wallet types: Falcon Direct, Dilithium Direct, Falcon NTT, Dilithium NTT
