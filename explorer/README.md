# PQ-ETH Explorer

Block explorer for the PQ-ETH devnet, highlighting which post-quantum signature scheme (Falcon-512 or ML-DSA-44) was used for each transaction.

## Features

- **Dashboard** — Chain stats, algorithm breakdown, recent transactions and blocks with auto-refresh
- **Block Explorer** — Paginated block list, block detail with transactions and PQ signature badges
- **Transaction Explorer** — Full transaction detail including dedicated Signature Scheme section showing algorithm, verification approach (Direct vs NTT/Lego), precompile addresses, gas costs, and building-block precompiles used
- **PQ Wallet Directory** — List all deployed post-quantum wallets, filterable by algorithm (Falcon-512 Direct, Falcon-512 NTT, ML-DSA-44 Direct, ML-DSA-44 NTT)
- **Address Detail** — Balances, PQ wallet info (public key, nonce, payer), and transaction history
- **Algorithm Badges** — Color-coded badges for each signature scheme:
  - Falcon-512 Direct (blue)
  - Falcon-512 NTT (teal, "Lego" label)
  - ML-DSA-44 Direct (purple)
  - ML-DSA-44 NTT (pink, "Lego" label)
  - ECDSA (gray)
  - 7702-Migration (amber)

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS (dark theme)

## Setup

```bash
npm install
npm run dev     # starts on port 3001
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8546` | Backend API base URL |
| `NEXT_PUBLIC_RPC_URL` | `http://localhost:8545` | Chain RPC endpoint |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard with chain stats, algorithm breakdown, recent txs/blocks |
| `/blocks` | Paginated block list |
| `/block/:number` | Block detail with transactions |
| `/transactions` | Paginated transaction list with signature scheme badges |
| `/tx/:hash` | Transaction detail with Signature Scheme section |
| `/address/:address` | Address/wallet detail with balances and history |
| `/wallets` | PQ wallet directory, filterable by algorithm |

## Data Sources

- **Backend API** (`/api/explorer/*`) — PQ-specific data (wallet info, algorithm classification)
- **Chain RPC** — Raw block and transaction data (fallback when backend unavailable)

## Port

Runs on port **3001** (frontend runs on 3000).
