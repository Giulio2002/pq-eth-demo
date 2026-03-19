# PQ Smart Wallet Frontend

Next.js 14 application for the post-quantum smart wallet demo. Generates PQ keypairs (Falcon-512 or ML-DSA-44) in the browser via WASM, stores private keys locally in IndexedDB, and communicates with the backend to deploy wallets and relay transactions.

## Prerequisites

- Node.js 18+ and npm
- Rust toolchain with `wasm32-unknown-unknown` target
- `wasm-pack`

Install WASM target if missing:
```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

## Quick Start

```bash
# Build everything (WASM + Next.js)
bash build.sh

# Or step-by-step:
cd pq-wasm && wasm-pack build --target web --release && cd ..
npm install
npm run build

# Start dev server (port 3000)
npm run dev
```

## Architecture

### PQ Cryptography (WASM)

The `pq-wasm/` directory contains a Rust crate compiled to WASM that provides:
- `falcon_keygen()` / `falcon_sign()` — Falcon-512 key generation and signing
- `dilithium_keygen()` / `dilithium_sign()` — ML-DSA-44 (Dilithium) key generation and signing

Private keys never leave the browser — all signing happens in WASM on the client side.

### Wallet Types

| Type | Algorithm | Verification | Gas Cost |
|------|-----------|-------------|----------|
| Falcon-512 Direct | Falcon-512 | Single precompile (0x17) | ~2,800 |
| Falcon-512 NTT | Falcon-512 | Lego/composite precompiles | ~5,000+ |
| ML-DSA-44 Direct | ML-DSA-44 | Single precompile (0x1b) | ~119,000 |
| ML-DSA-44 NTT | ML-DSA-44 | Lego/composite precompiles | ~150,000+ |

### Pages

- `/` — Dashboard: wallet overview, balances, recent transactions
- `/create` — Create wallet: choose algorithm, generate keypair, deploy
- `/send` — Send ETH: enter recipient and amount, PQ-sign, relay
- `/swap` — Swap ETH/USD: Uniswap V3 swap with PQ signing
- `/migrate` — EIP-7702 migration (advanced)
- `/settings` — View wallet info, export public key, delete wallet

### Key Storage

Keys are stored in IndexedDB (`pq-wallet-demo` database). The secret key is stored hex-encoded in the browser and is never sent to the backend API.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8546` | Backend API URL |

## Development

```bash
npm run dev     # Start dev server on port 3000
npm run build   # Production build
npm run start   # Start production server on port 3000
```
