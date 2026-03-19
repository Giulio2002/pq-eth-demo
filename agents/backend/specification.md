# Backend Agent

## Your Responsibility

Build the Go backend service that relays transactions for PQ smart wallets, indexes on-chain events, and manages a SQLite database. You own the `backend/` directory.

**Do not touch** `chain/`, `contracts/`, or `frontend/`.

---

## What to Build

A single Go HTTP server (port 8546) that:
- Deploys PQ smart wallets on behalf of users (via the factory contract)
- Relays signed transactions from the frontend to PQ smart wallets on-chain
- Indexes chain events (wallet deployments, transactions)
- Manages a SQLite database of wallets, transactions, and balances
- Holds a funded payer account to pay gas for all user transactions
- NEVER receives, stores, or logs PQ private keys — only public keys

### 1. Configuration (`backend/config/config.go`)

Read from env vars:

| Var | Default | Description |
|-----|---------|-------------|
| `CHAIN_RPC_URL` | (read from `../chain/rpc_url.txt`) | Erigon RPC endpoint |
| `BACKEND_PORT` | `8546` | Listening port |
| `PAYER_PRIVATE_KEY` | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` | Payer account key |
| `DEPLOYMENTS_FILE` | `../deployments.json` | Path to contract addresses |
| `DB_PATH` | `./data/backend.db` | SQLite path |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | CORS (frontend + explorer) |

On startup, the backend:
1. Reads `deployments.json` to get contract addresses (PQWalletFactory, SwapRouter, WETH9, USD, etc.)
2. Loads the payer private key
3. Opens/creates SQLite database with schema migration
4. Starts the HTTP server
5. Starts a background chain indexer goroutine

### 2. REST API

Base URL: `http://localhost:8546`

**Health**

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/health` | None | `{"status":"ok","chainBlock":123,"payerBalance":"1000000..."}` |

**Wallet Management**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/wallet/create` | Deploy a new PQ smart wallet |
| `GET` | `/api/wallet/:address` | Get wallet info (pubkey, algorithm, nonce, balances) |
| `GET` | `/api/wallet/:address/assets` | Get token balances (ETH, WETH, USD) |
| `GET` | `/api/wallet/:address/transactions` | Get transaction history |

**Transaction Relay**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/wallet/execute` | Relay a single PQ-signed transaction |
| `POST` | `/api/wallet/execute-batch` | Relay a batched PQ-signed transaction |
| `POST` | `/api/wallet/swap` | Convenience: build + relay an ETH-USD swap |

**EIP-7702 Migration**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/wallet/migrate-7702` | Submit 7702 authorization + initialize |

**Chain Info**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/chain/block` | Latest block number |
| `GET` | `/api/chain/pool-price` | Current ETH-USD price from the pool |

**Explorer (used by the block explorer UI on port 3001)**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/explorer/stats` | Aggregate stats: total wallets, txs, algorithm breakdown |
| `GET` | `/api/explorer/recent-transactions?limit=50` | Recent PQ transactions with wallet algorithm |
| `GET` | `/api/explorer/recent-blocks?limit=20` | Recent blocks with PQ tx count per block |
| `GET` | `/api/explorer/tx/:hash` | Single tx detail with wallet info + signature scheme |
| `GET` | `/api/explorer/wallets?algorithm=&sort=&limit=&offset=` | PQ wallet directory, filterable |
| `GET` | `/api/explorer/address/:address` | Address info: if PQ wallet, includes algorithm + pubkey |

Explorer endpoint details:

`GET /api/explorer/stats` response:
```json
{
  "totalWallets": 12,
  "totalTransactions": 47,
  "falconWallets": 8,
  "dilithiumWallets": 4,
  "falconTransactions": 30,
  "dilithiumTransactions": 17,
  "currentBlock": 1234
}
```

`GET /api/explorer/recent-transactions` response:
```json
[
  {
    "txHash": "0x...",
    "walletAddress": "0x...",
    "to": "0x...",
    "value": "0x...",
    "status": "success",
    "blockNumber": 42,
    "timestamp": "2026-03-18T10:05:00Z",
    "type": "transfer",
    "signatureScheme": "falcon",
    "verificationGas": 2800
  }
]
```

`GET /api/explorer/tx/:hash` response:
```json
{
  "txHash": "0x...",
  "walletAddress": "0x...",
  "to": "0x...",
  "value": "0x...",
  "data": "0x...",
  "status": "success",
  "blockNumber": 42,
  "timestamp": "2026-03-18T10:05:00Z",
  "type": "swap",
  "signatureScheme": "falcon",
  "publicKey": "0x...",
  "precompileAddress": "0x0000000000000000000000000000000000000017",
  "verificationGas": 2800,
  "gasUsed": 85000,
  "isMigrated7702": false
}
```

For non-PQ transactions (direct EOA sends), `signatureScheme` is `"ecdsa"` and `publicKey`/`precompileAddress` are omitted.

`GET /api/explorer/wallets` response:
```json
[
  {
    "address": "0x...",
    "algorithm": "falcon",
    "publicKeyPrefix": "0xab12...",
    "transactionCount": 15,
    "ethBalance": "1000000000000000000",
    "createdAt": "2026-03-18T10:00:00Z",
    "isMigrated7702": false
  }
]
```

`GET /api/explorer/address/:address` response (PQ wallet):
```json
{
  "address": "0x...",
  "isPQWallet": true,
  "algorithm": "falcon",
  "publicKey": "0x...",
  "nonce": 5,
  "payer": "0x...",
  "isMigrated7702": false,
  "ethBalance": "1000000000000000000",
  "wethBalance": "0",
  "usdBalance": "5000000000000000000000",
  "transactionCount": 15,
  "createdAt": "2026-03-18T10:00:00Z",
  "creationTxHash": "0x..."
}
```

For non-PQ addresses, `isPQWallet` is `false` and wallet-specific fields are omitted.

### 3. API Detail

#### `POST /api/wallet/create`

```json
// Request
{
  "publicKey": "0x...",     // hex-encoded PQ public key (897 bytes Falcon, 1312 bytes Dilithium)
  "algorithm": "falcon-direct"  // "falcon-direct", "dilithium-direct", "falcon-ntt", "dilithium-ntt"
}

// Response
{
  "walletAddress": "0x...",
  "txHash": "0x...",
  "algorithm": "falcon",
  "publicKeySize": 897
}
```

Backend logic:
1. Validate publicKey length (897 for falcon variants, 1312 for dilithium variants)
2. Map algorithm string to uint8: `"falcon-direct"→0, "dilithium-direct"→1, "falcon-ntt"→2, "dilithium-ntt"→3`
3. Encode `PQWalletFactory.createWallet(publicKey, algorithmId, payerAddress)` calldata
3. Submit transaction from payer account
4. Wait for receipt
5. Parse `WalletCreated` event to get wallet address
7. Store wallet in SQLite: `(address, publicKey, algorithm, createdAt, txHash)`
8. Return wallet address and txHash

#### `POST /api/wallet/execute`

```json
// Request
{
  "wallet": "0x...",        // PQ smart wallet address
  "to": "0x...",            // target address
  "value": "0x...",         // hex ETH value (wei)
  "data": "0x...",          // hex calldata (empty for plain ETH transfer)
  "signature": "0x..."      // hex PQ signature
}

// Response
{
  "txHash": "0x...",
  "success": true
}
```

Backend logic:
1. Look up wallet in DB — verify it exists
2. Encode `PQSmartWallet.execute(to, value, data, signature)` calldata
3. Submit transaction from payer account to the wallet address
4. Wait for receipt
5. Store transaction in SQLite: `(txHash, wallet, to, value, data, status, blockNumber, timestamp)`
6. Return txHash and success status

#### `POST /api/wallet/execute-batch`

```json
// Request
{
  "wallet": "0x...",
  "targets": ["0x...", "0x..."],
  "values": ["0x...", "0x..."],
  "datas": ["0x...", "0x..."],
  "signature": "0x..."
}

// Response
{
  "txHash": "0x...",
  "success": true
}
```

#### `POST /api/wallet/swap`

Convenience endpoint that builds Uniswap swap calldata for the user.

```json
// Request
{
  "wallet": "0x...",
  "direction": "eth_to_usd",    // or "usd_to_eth"
  "amountIn": "1000000000000000000",  // 1 ETH in wei (or 1000 USD in smallest unit)
  "minAmountOut": "0",           // slippage protection
  "signature": "0x..."           // PQ signature over the batch message hash
}

// Response
{
  "txHash": "0x...",
  "success": true,
  "amountIn": "1000000000000000000",
  "direction": "eth_to_usd"
}
```

Backend logic for `eth_to_usd`:
1. Build batch: [WETH.deposit() with ETH value, WETH.approve(SwapRouter, amount), SwapRouter.exactInputSingle()]
2. Encode as `executeBatch(targets, values, datas, signature)`
3. Submit from payer
4. Return result

The frontend must sign the batch message hash:
`keccak256(abi.encode(targets, values, datas, nonce, chainId))`

The backend provides a helper endpoint to compute this:

#### `POST /api/wallet/swap-message`

Returns the message hash the user needs to sign for a swap:

```json
// Request
{
  "wallet": "0x...",
  "direction": "eth_to_usd",
  "amountIn": "1000000000000000000",
  "minAmountOut": "0"
}

// Response
{
  "messageHash": "0x...",   // keccak256 to sign
  "nonce": 5,
  "chainId": 3151908
}
```

Similarly, `POST /api/wallet/execute-message` returns the message hash for a single execute.

#### `POST /api/wallet/migrate-7702`

```json
// Request
{
  "eoaAddress": "0x...",
  "publicKey": "0x...",
  "algorithm": "falcon",
  "authorization": "0x..."  // signed EIP-7702 authorization from the EOA
}

// Response
{
  "txHash": "0x...",
  "success": true
}
```

Backend logic:
1. Construct the EIP-7702 transaction setting the EOA's code to PQSmartWallet implementation
2. Submit from payer account
3. Call `EOA.initialize(publicKey, algorithm, payerAddress)` from payer
4. Store migration in DB

#### `GET /api/wallet/:address`

```json
{
  "address": "0x...",
  "publicKey": "0x...",
  "algorithm": "falcon",
  "nonce": 5,
  "ethBalance": "1000000000000000000",
  "createdAt": "2026-03-18T10:00:00Z",
  "isMigrated7702": false
}
```

#### `GET /api/wallet/:address/assets`

```json
{
  "eth": "1000000000000000000",
  "weth": "0",
  "usd": "5000000000000000000000"
}
```

Query chain for ETH balance + ERC-20 `balanceOf()` for WETH and USD.

#### `GET /api/wallet/:address/transactions`

```json
[
  {
    "txHash": "0x...",
    "to": "0x...",
    "value": "1000000000000000000",
    "status": "success",
    "blockNumber": 42,
    "timestamp": "2026-03-18T10:05:00Z",
    "type": "transfer"
  }
]
```

### 4. Database Schema

SQLite via `modernc.org/sqlite` (pure Go, no CGO).

```sql
CREATE TABLE wallets (
    address TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,          -- hex-encoded
    algorithm TEXT NOT NULL,           -- "falcon-direct", "dilithium-direct", "falcon-ntt", "dilithium-ntt"
    tx_hash TEXT NOT NULL,
    is_migrated_7702 INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL           -- RFC3339
);

CREATE TABLE transactions (
    tx_hash TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL REFERENCES wallets(address),
    to_address TEXT NOT NULL,
    value TEXT NOT NULL,               -- hex wei
    data TEXT,                         -- hex calldata
    status TEXT NOT NULL,              -- "pending", "success", "failed"
    block_number INTEGER,
    timestamp TEXT,                    -- RFC3339
    type TEXT NOT NULL DEFAULT 'execute'  -- "execute", "batch", "swap", "deploy", "migrate"
);

CREATE TABLE indexed_blocks (
    block_number INTEGER PRIMARY KEY,
    block_hash TEXT NOT NULL,
    indexed_at TEXT NOT NULL
);
```

### 5. Chain Indexer

A background goroutine that:
1. Polls for new blocks every 2 seconds
2. Scans for `WalletCreated` events from the factory (in case wallets are created outside the backend)
3. Updates transaction statuses from pending to success/failed
4. Stores indexed block numbers to avoid re-processing

### 6. Go Module & Dependencies

```
module pq-eth-backend
go 1.22

require (
    github.com/ethereum/go-ethereum v1.14.12
    modernc.org/sqlite v1.34.4
)
```

### 7. File Structure

```
backend/
  main.go                    — HTTP server, startup, graceful shutdown
  go.mod
  config/
    config.go                — env var config + deployments.json loading
  api/
    server.go                — route registration, CORS, middleware
    wallet.go                — wallet create/info/assets/transactions handlers
    relay.go                 — execute/executeBatch/swap relay handlers
    migrate.go               — EIP-7702 migration handler
    chain.go                 — block number, pool price handlers
    message.go               — message hash computation helpers
    explorer.go              — explorer endpoints: stats, recent-txs, tx detail, wallets, address
  chain/
    client.go                — go-ethereum RPC client wrapper
    indexer.go               — background block/event indexer
    contracts.go             — contract ABI bindings (factory, wallet, router, ERC20)
  db/
    db.go                    — SQLite open, schema migration
    wallets.go               — wallet CRUD
    transactions.go          — transaction CRUD
  data/
    .gitkeep
  Dockerfile
  README.md
```

### 8. Dockerfile

```dockerfile
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o backend .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/backend .
RUN mkdir -p data
EXPOSE 8546
CMD ["./backend"]
```

## Important Notes

- **NEVER store, log, or transmit PQ private keys** — the backend only sees public keys and signatures
- `modernc.org/sqlite` needs `_ "modernc.org/sqlite"` blank import in `main.go` for driver registration
- The payer account must have sufficient ETH to pay gas for all user transactions
- All hex values in the API use `0x` prefix
- CORS must allow `http://localhost:3000` (frontend)
- The backend reads `deployments.json` at startup — it must exist before the backend starts
- Chain RPC URL: prefer reading from `../chain/rpc_url.txt` if `CHAIN_RPC_URL` env var is not set
- For `executeBatch` swap building, the backend must know the exact Uniswap V3 function signatures and struct layouts (see shared_context.md for SwapRouter details)
- EIP-7702 support: constructing and sending 7702 transactions requires go-ethereum 1.14+ which includes 7702 transaction types. If the go-ethereum version does not support 7702 natively, use raw transaction construction
- All times in RFC3339 UTC
- Graceful shutdown: catch SIGINT/SIGTERM, stop indexer, close DB
