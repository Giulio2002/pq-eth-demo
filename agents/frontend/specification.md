# Frontend Agent

## Your Responsibility

Build the wallet UI for the post-quantum smart wallet demo. You own the `frontend/` directory.

**Do not touch** `chain/`, `contracts/`, or `backend/`.

---

## What to Build

A Next.js 14 application (TypeScript) running on port 3000 that:
- Generates PQ keypairs (Falcon-512 or ML-DSA-44) in the browser via WASM
- Stores PQ private keys exclusively in the browser (IndexedDB or localStorage)
- Communicates with the backend (port 8546) to deploy wallets and relay transactions
- Provides a wallet interface: send ETH, swap ETH-USD, view assets

### 1. PQ Cryptography in the Browser

The frontend must generate keypairs and sign messages using post-quantum algorithms **entirely in the browser**. The private key NEVER leaves the browser.

**Approach: Rust → WASM module**

Create `frontend/pq-wasm/` — a Rust crate compiled to WASM:

```
frontend/pq-wasm/
  Cargo.toml
  src/lib.rs
```

**Cargo.toml**:
```toml
[package]
name = "pq-wasm"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
wasm-bindgen = "0.2"
pqcrypto-falcon = { version = "0.3", default-features = false }
pqcrypto-dilithium = { version = "0.5", default-features = false }
pqcrypto-traits = "0.3"
js-sys = "0.3"
getrandom = { version = "0.2", features = ["js"] }

[profile.release]
opt-level = "s"
lto = true
```

**src/lib.rs** — expose these functions via `wasm_bindgen`:

```rust
use wasm_bindgen::prelude::*;
use pqcrypto_falcon::falcon512;
use pqcrypto_dilithium::dilithium2;  // ML-DSA-44
use pqcrypto_traits::sign::{PublicKey, SecretKey, SignedMessage, DetachedSignature};

#[wasm_bindgen]
pub fn falcon_keygen() -> Vec<u8> {
    // Returns: publicKey (897 bytes) || secretKey (1281 bytes)
    let (pk, sk) = falcon512::keypair();
    let mut result = pk.as_bytes().to_vec();
    result.extend_from_slice(sk.as_bytes());
    result
}

#[wasm_bindgen]
pub fn falcon_sign(secret_key: &[u8], message: &[u8]) -> Vec<u8> {
    // Returns detached signature
    let sk = falcon512::SecretKey::from_bytes(secret_key).unwrap();
    let sig = falcon512::detached_sign(message, &sk);
    sig.as_bytes().to_vec()
}

#[wasm_bindgen]
pub fn dilithium_keygen() -> Vec<u8> {
    // Returns: publicKey (1312 bytes) || secretKey (2560 bytes)
    let (pk, sk) = dilithium2::keypair();
    let mut result = pk.as_bytes().to_vec();
    result.extend_from_slice(sk.as_bytes());
    result
}

#[wasm_bindgen]
pub fn dilithium_sign(secret_key: &[u8], message: &[u8]) -> Vec<u8> {
    // Returns detached signature (2420 bytes)
    let sk = dilithium2::SecretKey::from_bytes(secret_key).unwrap();
    let sig = dilithium2::detached_sign(message, &sk);
    sig.as_bytes().to_vec()
}
```

Build with:
```bash
cd frontend/pq-wasm
wasm-pack build --target web --release
```

This produces `frontend/pq-wasm/pkg/` which is imported by the Next.js app.

**IMPORTANT**: If `pqcrypto-falcon` or `pqcrypto-dilithium` crate versions have changed or the API differs, adapt accordingly. The key constraint is: the WASM module must provide keygen and detached signing for both Falcon-512 and ML-DSA-44 (Dilithium2). If the Rust crates prove problematic for WASM compilation, fall back to:
- Alternative A: Use `liboqs` compiled to WASM via Emscripten
- Alternative B: Use the `@aspect-build/pqcrypto` npm package if available
- Alternative C: Use any other WASM-compatible PQ crypto library that supports Falcon-512 and ML-DSA-44

The exact library doesn't matter — what matters is that keygen and signing work in the browser and produce signatures compatible with the on-chain precompiles.

### 2. Key Storage

Store PQ keys in the browser using IndexedDB (preferred) or localStorage:

```typescript
interface StoredWallet {
  walletAddress: string;       // on-chain smart wallet address
  algorithm: "falcon-direct" | "falcon-ntt" | "dilithium-direct" | "dilithium-ntt";
  publicKey: Uint8Array;       // 897 (Falcon variants) or 1312 (Dilithium variants) bytes
  secretKey: Uint8Array;       // 1281 (Falcon) or 2560 (Dilithium) bytes (NEVER sent to backend)
  createdAt: string;
}
```

Use IndexedDB via `idb` npm package for structured storage:
- Database: `pq-wallet-demo`
- Object store: `wallets`
- Key path: `walletAddress`

On page load, check IndexedDB for existing wallets. If found, use them. If not, show the wallet creation flow.

### 3. Pages & Routes

#### `/` — Home / Dashboard

If no wallet exists in IndexedDB:
- Show "Create Wallet" flow (see below)

If wallet(s) exist:
- Show primary wallet address
- Show asset balances (ETH, USD, WETH) — fetched from `GET /api/wallet/:address/assets`
- Show recent transactions — fetched from `GET /api/wallet/:address/transactions`
- Navigation to Send, Swap, Settings

#### `/create` — Wallet Creation

1. User selects from **4 wallet types** with clear explanations:

   **Falcon-512 Direct** — Fastest verification
   - Single precompile call (address 0x17), ~2,800 gas
   - Verification is a single opaque call — efficient but not inspectable on-chain

   **Falcon-512 NTT** — Transparent verification (Lego approach)
   - Uses building-block precompiles (NTT, SHAKE, polynomial ops) step-by-step
   - Each cryptographic operation is a separate on-chain call — fully auditable
   - Slightly higher gas (~5,000+) but verification process is transparent

   **ML-DSA-44 Direct** — NIST standard, single call
   - Single precompile call (address 0x1b), ~119,000 gas
   - ML-DSA-44 (Dilithium) — the NIST post-quantum signature standard

   **ML-DSA-44 NTT** — NIST standard, transparent (Lego approach)
   - Composes NTT, ExpandA, vector arithmetic precompiles step-by-step
   - Higher gas (~150,000+) but each verification step is individually visible on-chain

   Show a comparison card/table with columns: Algorithm, Approach, Gas Cost, Trade-off.
   Highlight that "Direct" = simpler/cheaper, "NTT/Lego" = transparent/auditable.

2. User clicks "Generate Keypair"
   - Call `falcon_keygen()` or `dilithium_keygen()` from WASM (same keygen for Direct and NTT variants of the same algorithm)
   - Split result into publicKey + secretKey
   - Show public key fingerprint (first 8 bytes hex)
3. User clicks "Deploy Wallet"
   - `POST /api/wallet/create` with `{publicKey: hex, algorithm: "falcon-direct"|"falcon-ntt"|"dilithium-direct"|"dilithium-ntt"}`
   - Show loading state while tx confirms
4. On success:
   - Store wallet in IndexedDB (address, keys, algorithm)
   - Redirect to dashboard

#### `/send` — Send ETH

1. Input fields:
   - **Recipient address** (0x...)
   - **Amount** (ETH, with USD equivalent shown)
2. User clicks "Send"
3. Frontend:
   a. `POST /api/wallet/execute-message` with `{wallet, to, value: weiHex, data: "0x"}` → get `messageHash`
   b. Sign `messageHash` with PQ private key (WASM): `falcon_sign(sk, messageHash)` or `dilithium_sign(sk, messageHash)`
   c. `POST /api/wallet/execute` with `{wallet, to, value, data: "0x", signature: hex}`
4. Show tx hash and confirmation status

#### `/swap` — Swap ETH ↔ USD

1. Input:
   - **Direction**: ETH → USD or USD → ETH (toggle)
   - **Amount** (input token)
   - Show estimated output (from `GET /api/chain/pool-price`)
2. User clicks "Swap"
3. Frontend:
   a. `POST /api/wallet/swap-message` with `{wallet, direction, amountIn, minAmountOut}` → get `messageHash`
   b. Sign `messageHash` with PQ private key
   c. `POST /api/wallet/swap` with `{wallet, direction, amountIn, minAmountOut, signature: hex}`
4. Show tx hash and confirmation

#### `/migrate` — EIP-7702 Migration (Optional/Advanced)

1. User connects existing EOA (e.g., via MetaMask or manual private key entry)
2. User generates PQ keypair
3. Frontend constructs EIP-7702 authorization
4. `POST /api/wallet/migrate-7702` with authorization + PQ public key
5. Show migration status

#### `/settings` — Settings

- View wallet address, algorithm, public key fingerprint
- Export public key (hex)
- Delete wallet from browser (with confirmation)
- Backend URL configuration

### 4. API Client (`frontend/src/lib/api.ts`)

Type-safe API client for the backend:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546";

export async function createWallet(publicKey: string, algorithm: string) { ... }
export async function getWallet(address: string) { ... }
export async function getAssets(address: string) { ... }
export async function getTransactions(address: string) { ... }
export async function getExecuteMessage(wallet: string, to: string, value: string, data: string) { ... }
export async function execute(wallet: string, to: string, value: string, data: string, signature: string) { ... }
export async function getSwapMessage(wallet: string, direction: string, amountIn: string, minAmountOut: string) { ... }
export async function swap(wallet: string, direction: string, amountIn: string, minAmountOut: string, signature: string) { ... }
export async function getPoolPrice() { ... }
export async function getChainBlock() { ... }
```

### 5. PQ Crypto Wrapper (`frontend/src/lib/pq.ts`)

```typescript
let wasmModule: any = null;

export async function initPQ(): Promise<void> {
  // Dynamic import of WASM module
  wasmModule = await import("../../pq-wasm/pkg");
}

export function generateKeypair(algorithm: "falcon-direct" | "falcon-ntt" | "dilithium-direct" | "dilithium-ntt"): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  const isFalcon = algorithm.startsWith("falcon");
  const raw = isFalcon
    ? wasmModule.falcon_keygen()
    : wasmModule.dilithium_keygen();

  const pkSize = isFalcon ? 897 : 1312;
  return {
    publicKey: raw.slice(0, pkSize),
    secretKey: raw.slice(pkSize),
  };
}

export function sign(
  algorithm: "falcon-direct" | "falcon-ntt" | "dilithium-direct" | "dilithium-ntt",
  secretKey: Uint8Array,
  message: Uint8Array
): Uint8Array {
  // Signing is the same for Direct and NTT variants — only on-chain verification differs
  return algorithm.startsWith("falcon")
    ? wasmModule.falcon_sign(secretKey, message)
    : wasmModule.dilithium_sign(secretKey, message);
}
```

### 6. Styling

Use **Tailwind CSS** with a clean, modern dark theme. No complex UI library required — focus on functionality over aesthetics. The demo should look professional but development time should go to functionality.

Key UI elements:
- Algorithm badge (Falcon = blue, Dilithium = purple)
- Transaction status indicators (pending = yellow, success = green, failed = red)
- ETH/USD amounts formatted with proper decimals
- Responsive layout (works on desktop, doesn't need mobile)

### 7. Build Configuration

**`next.config.js`** — configure WASM support:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8546",
  },
};
module.exports = nextConfig;
```

### 8. Build Script (`frontend/build.sh`)

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[frontend] Building PQ WASM module..."
cd "$SCRIPT_DIR/pq-wasm"
wasm-pack build --target web --release

echo "[frontend] Installing npm dependencies..."
cd "$SCRIPT_DIR"
npm install

echo "[frontend] Building Next.js app..."
npm run build

echo "[frontend] Done."
```

## File Structure

```
frontend/
  package.json
  next.config.js
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  build.sh
  README.md
  pq-wasm/
    Cargo.toml
    src/
      lib.rs
    pkg/                         (generated by wasm-pack)
  src/
    app/
      layout.tsx                 (root layout, PQ init)
      page.tsx                   (dashboard / home)
      create/
        page.tsx                 (wallet creation flow)
      send/
        page.tsx                 (send ETH)
      swap/
        page.tsx                 (swap ETH ↔ USD)
      migrate/
        page.tsx                 (EIP-7702 migration)
      settings/
        page.tsx                 (wallet settings)
    lib/
      api.ts                     (backend API client)
      pq.ts                      (PQ WASM wrapper)
      wallet-store.ts            (IndexedDB wallet storage)
      utils.ts                   (hex conversion, formatting)
    components/
      WalletHeader.tsx           (address, algorithm badge, balance)
      AssetList.tsx              (ETH, USD, WETH balances)
      TransactionList.tsx        (recent transactions)
      AlgorithmSelector.tsx      (Falcon vs Dilithium selection)
      AmountInput.tsx            (ETH/USD input with conversion)
```

## Prerequisites

- Node.js 18+ and npm
- Rust toolchain (`rustup`) with `wasm32-unknown-unknown` target
- `wasm-pack` (`cargo install wasm-pack`)

Install WASM target if missing:
```bash
rustup target add wasm32-unknown-unknown
```

## Important Notes

- PQ private keys MUST NEVER leave the browser — not in API calls, not in logs, not in any form
- The WASM module is loaded asynchronously — show a loading state until `initPQ()` resolves
- IndexedDB is preferred over localStorage for binary key storage (no base64 encoding needed)
- The frontend NEVER submits transactions directly to the chain — everything goes through the backend
- For the message hash: the frontend calls the backend's message hash endpoint, then signs locally, then sends the signature back. This ensures the message format matches what the smart wallet expects.
- Hex encoding: all byte arrays sent to the API must be `0x`-prefixed hex strings
- ETH amounts: display in ETH (not wei) with 4-6 decimal places; API uses wei hex strings
- USD amounts: display with 2 decimal places; stored as 18-decimal fixed-point on-chain
- The `pq-wasm` build produces `pkg/pq_wasm.js` and `pkg/pq_wasm_bg.wasm` — both must be accessible by Next.js
- If WASM import causes issues with Next.js SSR, use dynamic import with `ssr: false`
- The EIP-7702 migration page is optional/stretch — implement it if time permits, but the core flows (create, send, swap) are the priority
