# PQ Smart Wallet Contracts

Foundry project containing post-quantum smart wallet contracts for the PQ-ETH demo.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed

## Build

```bash
forge build && FOUNDRY_PROFILE=v3 forge build
```

## Test

```bash
forge test -v
```

## Deploy

Requires a running chain (Erigon PQ branch via Kurtosis):

```bash
./deploy.sh
```

This deploys all contracts (PQ wallets, factory, USD, WETH9, Uniswap V3 pool) and writes `deployments.json` to the repo root.

## Contract Overview

- **PQSmartWallet** — Core smart wallet with PQ signature verification (4 modes)
- **PQWalletFactory** — Deploys and initializes PQ wallets
- **USD** — Mintable ERC-20 stablecoin for the demo pool
- **WETH9** — Wrapped ETH (Solidity 0.7.6, Uniswap V3 compatible)
- **FalconVerifierNTT** / **DilithiumVerifierNTT** — Yul verifier contracts from pq-eth-precompiles
