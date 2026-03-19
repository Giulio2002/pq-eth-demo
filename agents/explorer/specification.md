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
