# Agent Task

This folder is being worked on by an automated agent.

## Project Context

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


## Specification

# Explorer Agent

## Your Responsibility

Build a block explorer web UI that displays all transactions on the PQ devnet, highlighting which post-quantum signature scheme (Falcon-512 or ML-DSA-44) was used for each transaction. You own the `explorer/` directory.

**Do not touch** `chain/`, `contracts/`, `backend/`, or `frontend/`.

---

## What to Build

A Next.js 14 application (TypeScript) running on port 3001 that provides a public block explorer for the PQ-ETH devnet. The key differentiator from a standard explorer: every PQ smart wallet transaction prominently shows the signature algorithm used.

### 1. Pages & Routes

#### `/` — Dashboard

Overview page showing:
- **Chain stats**: current block number, total PQ wallets, total PQ transactions
- **Algorithm breakdown**: pie chart or stat cards showing count of Falcon-512 vs Dilithium wallets
- **Recent transactions**: last 20 transactions with signature scheme badges
- **Recent blocks**: last 10 blocks with PQ transaction counts per block
- Auto-refreshes every 5 seconds

#### `/blocks` — Block List

Paginated list of blocks:
- Block number, timestamp, transaction count, PQ transaction count
- Click to see block detail

#### `/block/:number` — Block Detail

- Block number, hash, timestamp, parent hash, gas used
- List of all transactions in the block
- Each PQ wallet transaction shows its verification approach:
  - Falcon-512 Direct (blue badge)
  - Falcon-512 NTT (blue-green badge, "Lego" label)
  - ML-DSA-44 Direct (purple badge)
  - ML-DSA-44 NTT (purple-pink badge, "Lego" label)
- Non-PQ transactions show: "ECDSA" (gray badge)

#### `/transactions` — Transaction List

Paginated list of all transactions:
- Tx hash (truncated, clickable)
- From address (wallet or EOA)
- To address
- Value (ETH)
- Block number
- **Signature scheme badge**: Falcon Direct / Falcon NTT / Dilithium Direct / Dilithium NTT / ECDSA / 7702-Migration
- Status: success / failed
- Timestamp

#### `/tx/:hash` — Transaction Detail

Full transaction details:
- Tx hash, block number, block hash, timestamp
- From address (clickable → wallet page)
- To address
- Value (ETH + USD equivalent using pool price)
- Gas used, gas price
- Input data (hex, collapsible)
- **Signature Scheme section**:
  - Algorithm + approach: Falcon-512 Direct / Falcon-512 NTT / ML-DSA-44 Direct / ML-DSA-44 NTT
  - Public key (hex, truncated with copy button)
  - Verification method: "Direct precompile (0x17)" or "NTT Lego via FalconVerifierNTT" etc.
  - Verification gas cost: ~2,800 (Falcon Direct), ~5,000+ (Falcon NTT), ~119,000 (Dilithium Direct), ~150,000+ (Dilithium NTT)
  - For NTT: show list of building-block precompiles used (NTT_FW, NTT_INV, VECMULMOD, SHAKE, etc.)
  - Precompile address used: 0x17 / 0x1b (direct) or verifier contract address (NTT)
- Transaction type: Transfer / Swap / Batch / Deploy / 7702-Migration
- If swap: show swap details (token in, token out, amounts)

#### `/address/:address` — Address / Wallet Detail

- Address
- If PQ wallet:
  - Algorithm badge (Falcon-512 / ML-DSA-44)
  - Public key (full hex, copyable)
  - Wallet nonce
  - Payer address
  - Whether it's a 7702-migrated EOA
  - Creation tx hash
- Balances: ETH, WETH, USD
- Transaction list for this address (most recent first)
- Total transaction count

#### `/wallets` — PQ Wallet Directory

List of all deployed PQ wallets:
- Address, algorithm badge, creation date, transaction count, ETH balance
- Filter by algorithm: All / Falcon-512 / ML-DSA-44
- Sort by: newest, most transactions, highest balance

### 2. Data Sources

The explorer fetches data from two sources:

**Backend API (port 8546)** — for PQ-specific data:
- `GET /api/explorer/recent-transactions?limit=50` — recent PQ transactions with wallet algorithm
- `GET /api/explorer/recent-blocks?limit=20` — recent blocks with PQ tx counts
- `GET /api/explorer/tx/:hash` — single transaction with wallet info + signature scheme
- `GET /api/explorer/stats` — aggregate stats (total wallets, txs, algorithm breakdown)
- `GET /api/explorer/wallets?algorithm=&sort=&limit=&offset=` — wallet directory
- `GET /api/explorer/address/:address` — address info (wallet details if PQ wallet)
- `GET /api/chain/pool-price` — ETH-USD price for value display

**Chain RPC (from chain/rpc_url.txt or via backend)** — for raw block data:
- `eth_blockNumber` — latest block
- `eth_getBlockByNumber` — block details with transactions
- `eth_getTransactionByHash` — raw transaction data
- `eth_getTransactionReceipt` — receipt with logs and status

The backend's explorer endpoints join chain data with the wallet database to attach the signature scheme to each transaction. The explorer UI should primarily use the backend API and fall back to direct RPC only when needed (e.g., for non-PQ transaction details).

### 3. Signature Scheme Detection

For each transaction, the explorer determines the signature scheme:

1. **PQ wallet transaction** (most common): the `to` field of the outer transaction is a known PQ smart wallet address. Look up the wallet in the backend DB to get its algorithm (0 = Falcon, 1 = Dilithium).

2. **Factory deployment**: the `to` field is the PQWalletFactory. Parse the `WalletCreated` event to get the algorithm.

3. **7702 migration**: detect by transaction type (0x04 = EIP-7702). Show "7702-Migration" badge.

4. **Plain ECDSA**: any transaction not involving a PQ wallet. Show "ECDSA" (gray badge).

The backend's explorer endpoints handle this classification — the frontend just renders the `signatureScheme` field from the API response.

### 4. UI Design

**Theme**: Dark background with PQ-themed accents.

**Color scheme for algorithm badges**:
- Falcon-512 Direct: Blue badge (`#3B82F6`)
- Falcon-512 NTT: Teal badge (`#14B8A6`) with "Lego" sub-label
- ML-DSA-44 Direct: Purple badge (`#8B5CF6`)
- ML-DSA-44 NTT: Pink badge (`#EC4899`) with "Lego" sub-label
- ECDSA: Gray badge (`#6B7280`)
- 7702-Migration: Amber badge (`#F59E0B`)

**Key UI components**:
- `AlgorithmBadge` — colored badge showing signature scheme
- `TxRow` — transaction row with hash, from, to, value, scheme badge, status
- `BlockRow` — block row with number, timestamp, tx count, PQ tx count
- `AddressLink` — clickable address that navigates to address detail
- `TxHashLink` — clickable truncated hash
- `StatCard` — number + label card for dashboard stats
- `CopyButton` — copy hex values to clipboard
- `DataTable` — paginated, sortable table

**Responsive**: Desktop-optimized but functional on tablet.

### 5. API Client (`explorer/src/lib/api.ts`)

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545";

// Backend API
export async function getStats() { ... }
export async function getRecentTransactions(limit?: number) { ... }
export async function getRecentBlocks(limit?: number) { ... }
export async function getTransaction(hash: string) { ... }
export async function getWallets(params?: { algorithm?: string; sort?: string; limit?: number; offset?: number }) { ... }
export async function getAddress(address: string) { ... }
export async function getPoolPrice() { ... }

// Direct RPC (fallback)
export async function rpcCall(method: string, params: any[]) { ... }
export async function getBlock(number: number | "latest") { ... }
export async function getBlockTransactions(number: number) { ... }
```

### 6. Real-time Updates

Use polling (5-second interval) for:
- Dashboard stats and recent transactions
- Block list (new blocks appear at top)
- Transaction status updates (pending → success/failed)

Use `setInterval` + `useEffect` — no WebSocket needed for a demo.

### 7. Build Configuration

**`next.config.js`**:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546",
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545",
  },
};
module.exports = nextConfig;
```

Port 3001 — set in `package.json` scripts:
```json
{
  "scripts": {
    "dev": "next dev -p 3001",
    "build": "next build",
    "start": "next start -p 3001"
  }
}
```

## File Structure

```
explorer/
  package.json
  next.config.js
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  README.md
  src/
    app/
      layout.tsx                 (root layout, dark theme, nav)
      page.tsx                   (dashboard)
      blocks/
        page.tsx                 (block list)
      block/
        [number]/
          page.tsx               (block detail)
      transactions/
        page.tsx                 (transaction list)
      tx/
        [hash]/
          page.tsx               (transaction detail with signature scheme)
      address/
        [address]/
          page.tsx               (address/wallet detail)
      wallets/
        page.tsx                 (PQ wallet directory)
    lib/
      api.ts                     (backend + RPC API client)
      utils.ts                   (hex formatting, time formatting, wei conversion)
    components/
      AlgorithmBadge.tsx         (Falcon/Dilithium/ECDSA/7702 badge)
      TxRow.tsx                  (transaction table row)
      BlockRow.tsx               (block table row)
      AddressLink.tsx            (clickable address)
      TxHashLink.tsx             (clickable tx hash)
      StatCard.tsx               (dashboard stat card)
      CopyButton.tsx             (copy to clipboard)
      DataTable.tsx              (paginated sortable table)
      Navbar.tsx                 (top navigation)
```

## Prerequisites

- Node.js 18+ and npm

## Important Notes

- The explorer runs on port **3001** (not 3000 — that's the wallet frontend)
- All PQ-specific data comes from the backend's `/api/explorer/*` endpoints
- The explorer is read-only — no transaction submission, no key handling
- The signature scheme badge is the key differentiator — make it prominent on every transaction
- Use Tailwind CSS with a dark theme consistent with the frontend
- Auto-refresh interval: 5 seconds for dashboard, 10 seconds for list pages
- Handle missing/loading data gracefully — the chain or backend may not be running when the explorer starts
- Truncate long hex values (addresses: first 6 + last 4 chars, tx hashes: first 10 + last 6 chars) with full value on hover/click
- ETH values: show in ETH with 4 decimal places; show USD equivalent using pool price
- The explorer should work even if no PQ transactions exist yet — show empty states


## Success Criteria (Objective)

# Explorer Agent — Success Criteria

## One-sentence goal

Build a block explorer (Next.js, port 3001) that lists blocks, transactions, and wallets on the PQ devnet, prominently displaying which post-quantum signature scheme (Falcon-512 or ML-DSA-44) was used for each transaction.

---

## Verification Commands

### 1. npm install succeeds

```bash
cd explorer
npm install 2>&1
echo "Exit code: $?"
```

### 2. Next.js builds

```bash
cd explorer
npm run build 2>&1
echo "Exit code: $?"
# Must exit 0
```

### 3. Dev server starts on port 3001

```bash
cd explorer
npm run dev &
EXPLORER_PID=$!
sleep 8

curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200" \
  && echo "OK: explorer serves on :3001" \
  || echo "FAIL: not responding"

kill $EXPLORER_PID 2>/dev/null
```

### 4. All pages render

```bash
cd explorer
npm run dev &
EXPLORER_PID=$!
sleep 8

for PAGE in "/" "/blocks" "/transactions" "/wallets"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001$PAGE")
  [ "$CODE" = "200" ] && echo "OK: $PAGE ($CODE)" || echo "FAIL: $PAGE ($CODE)"
done

kill $EXPLORER_PID 2>/dev/null
```

### 5. Algorithm badge component exists and distinguishes schemes

```bash
cd explorer
grep -l "AlgorithmBadge\|algorithmBadge\|algorithm-badge" src/components/*.tsx \
  && echo "OK: AlgorithmBadge component found"

# Verify it handles all schemes
grep -c "falcon-direct\|falcon-ntt\|dilithium-direct\|dilithium-ntt\|ecdsa\|7702" src/components/AlgorithmBadge.tsx \
  | python3 -c "import sys; n=int(sys.stdin.read()); assert n >= 6; print(f'OK: {n} scheme references')"
```

### 6. Transaction detail page shows signature scheme

```bash
cd explorer
# Check that the tx detail page references signature scheme
grep -l "signatureScheme\|signature_scheme\|algorithm" src/app/tx/\\[hash\\]/page.tsx \
  && echo "OK: tx detail shows signature scheme"
```

### 7. Key files exist

```bash
for F in \
  explorer/package.json \
  explorer/next.config.js \
  explorer/tsconfig.json \
  explorer/tailwind.config.ts \
  explorer/README.md \
  explorer/src/app/layout.tsx \
  explorer/src/app/page.tsx \
  explorer/src/app/blocks/page.tsx \
  explorer/src/app/transactions/page.tsx \
  explorer/src/app/wallets/page.tsx \
  explorer/src/lib/api.ts \
  explorer/src/lib/utils.ts \
  explorer/src/components/AlgorithmBadge.tsx \
  explorer/src/components/TxRow.tsx \
  explorer/src/components/BlockRow.tsx; do
  test -f "$F" && echo "OK: $F" || echo "FAIL: $F missing"
done
```

### 8. Port 3001 configured

```bash
cd explorer
grep -q "3001" package.json && echo "OK: port 3001 in package.json" || echo "FAIL"
```

### 9. TypeScript compiles

```bash
cd explorer
npx tsc --noEmit 2>&1
echo "Exit code: $?"
```

### 10. Dark theme applied

```bash
cd explorer
# Check tailwind config or layout for dark mode
grep -q "dark" explorer/tailwind.config.ts 2>/dev/null || \
grep -q "dark" explorer/src/app/layout.tsx 2>/dev/null || \
grep -q "bg-gray-9\|bg-slate-9\|bg-zinc-9\|bg-neutral-9" explorer/src/app/layout.tsx 2>/dev/null
echo "Verify dark theme visually"
```

## Success Criteria

- [ ] `npm install` exits 0
- [ ] `npm run build` exits 0 (Next.js production build)
- [ ] Dev server starts on port **3001** (not 3000)
- [ ] `/` dashboard: shows chain stats, algorithm breakdown, recent transactions, recent blocks
- [ ] `/blocks` page: paginated block list with PQ tx counts
- [ ] `/block/:number` page: block detail with transaction list showing signature scheme badges
- [ ] `/transactions` page: paginated transaction list, each row has a **signature scheme badge**
- [ ] `/tx/:hash` page: full transaction detail with dedicated **Signature Scheme section** showing algorithm name, verification approach (Direct vs NTT/Lego), precompile/verifier address, verification gas cost, and for NTT types the list of building-block precompiles used
- [ ] `/address/:address` page: address detail, shows PQ wallet info (algorithm, public key, nonce) if applicable
- [ ] `/wallets` page: directory of all PQ wallets, filterable by algorithm
- [ ] `AlgorithmBadge` component: Falcon Direct = blue, Falcon NTT = teal + "Lego", Dilithium Direct = purple, Dilithium NTT = pink + "Lego", ECDSA = gray, 7702 = amber
- [ ] Auto-refresh: dashboard updates every 5 seconds
- [ ] Dark theme with PQ-themed accents
- [ ] All API calls target backend port 8546 (via `/api/explorer/*` endpoints)
- [ ] Empty states: pages handle gracefully when no data exists yet
- [ ] Hex values truncated with copy-to-clipboard functionality
- [ ] ETH values shown with USD equivalent (from pool price)
- [ ] TypeScript compiles without errors
- [ ] README.md documents setup and features

## Known Gotchas

### Backend explorer endpoints
The explorer depends on `/api/explorer/*` endpoints in the backend. These are specified in the backend spec. If the backend agent hasn't implemented them yet, the explorer should handle API errors gracefully (show loading/error states, not crash).

### Port conflict
Port 3001 must not conflict with the frontend (port 3000). Ensure `package.json` scripts use `-p 3001`.

### Algorithm detection
The explorer doesn't detect algorithms itself — it reads the `signatureScheme` or `algorithm` field from the backend's API responses. The backend joins transaction data with the wallet DB to provide this.

### Non-PQ transactions
The chain may have non-PQ transactions (e.g., contract deployments, direct transfers from funded accounts). These should show "ECDSA" badge, not be hidden.


## Important Notes

- A **strict verifier agent** will independently check your work when you are done.
- The verifier has no access to your session — it only reads the actual files.
- Claims you make that are not backed by real file changes will be caught.
- Do not leave TODOs, stubs, or placeholder code. Every criterion must be fully met.
- Run tests / build commands to confirm your work is correct before finishing.
