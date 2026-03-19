# PQ Smart Wallet Backend

Go HTTP server (port 8546) that deploys PQ smart wallets, relays PQ-signed transactions, indexes chain events, and serves asset/transaction queries.

## Prerequisites

- Go 1.22+
- Running Erigon PQ chain (via Kurtosis)
- Deployed contracts (`deployments.json` in repo root)

## Setup

```bash
cd backend
go mod tidy
go build ./...
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `CHAIN_RPC_URL` | from `../chain/rpc_url.txt` | Erigon RPC endpoint |
| `BACKEND_PORT` | `8546` | HTTP listen port |
| `PAYER_PRIVATE_KEY` | Hardhat #1 | Payer account private key |
| `DEPLOYMENTS_FILE` | `../deployments.json` | Contract addresses file |
| `DB_PATH` | `./data/backend.db` | SQLite database path |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` | CORS origins |

## Running

```bash
go run .
```

## API Endpoints

### Health
- `GET /health` — health check with chain block and payer balance

### Wallet Management
- `POST /api/wallet/create` — deploy a new PQ smart wallet
- `GET /api/wallet/:address` — get wallet info
- `GET /api/wallet/:address/assets` — get ETH/WETH/USD balances
- `GET /api/wallet/:address/transactions` — get transaction history

### Transaction Relay
- `POST /api/wallet/execute` — relay a PQ-signed transaction
- `POST /api/wallet/execute-batch` — relay a batched transaction
- `POST /api/wallet/swap` — build and relay an ETH-USD swap

### Message Hash Helpers
- `POST /api/wallet/execute-message` — get message hash to sign for execute
- `POST /api/wallet/swap-message` — get message hash to sign for swap

### Chain Info
- `GET /api/chain/block` — latest block number
- `GET /api/chain/pool-price` — ETH-USD price from Uniswap pool

### Explorer
- `GET /api/explorer/stats` — aggregate stats
- `GET /api/explorer/recent-transactions` — recent transactions
- `GET /api/explorer/recent-blocks` — recent blocks
- `GET /api/explorer/tx/:hash` — transaction detail
- `GET /api/explorer/wallets` — wallet directory
- `GET /api/explorer/address/:address` — address info

## Docker

```bash
docker build -t pq-backend .
docker run -p 8546:8546 -v ./data:/app/data pq-backend
```
