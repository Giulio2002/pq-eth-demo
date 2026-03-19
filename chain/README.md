# Chain — PQ Ethereum Devnet

Kurtosis-managed Ethereum devnet with **Erigon** (PQ precompiles branch) as the execution layer and **Prysm** as the consensus layer.

## Prerequisites

- **Docker** — running, with at least 4 GB RAM available
- **Kurtosis CLI** — `brew install kurtosis-tech/tap/kurtosis-cli` or `curl -sSL https://get.kurtosis.com | bash`
- **Git**
- **curl**
- **python3**

## Quick Start

```bash
# Start the devnet (builds Erigon image on first run — ~15 min)
bash chain/start.sh

# Get the RPC URL
bash chain/get_rpc_url.sh

# Test PQ precompiles
bash chain/test_precompiles.sh

# Stop the devnet
bash chain/stop.sh
```

## Scripts

| Script | Purpose |
|---|---|
| `start.sh` | Build Erigon PQ image (if needed), start Kurtosis devnet, verify blocks + balances |
| `stop.sh` | Tear down the Kurtosis `pq-demo` enclave |
| `test_precompiles.sh` | Verify PQ precompiles (0x16, 0x17, 0x1b) are reachable |
| `get_rpc_url.sh` | Print the active RPC URL from `rpc_url.txt` |

## Configuration

`network_params.yaml` configures the Kurtosis `ethereum-package`:

- **EL**: Erigon with `erigon-pq:local` image (PQ precompiles at 0x12–0x1b)
- **CL**: Prysm
- **Slot time**: 2 seconds
- **Network ID**: 3151908
- **Preset**: minimal (128 validators)

## Pre-funded Accounts

| Role | Address | Balance |
|---|---|---|
| Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | 1,000,000 ETH |
| Payer | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | 1,000,000 ETH |
| Liquidity | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | 1,000,000 ETH |
| Reserve | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | 1,000,000 ETH |

Derived from mnemonic: `test test test test test test test test test test test junk`

## PQ Precompiles

| Address | Name | Gas |
|---|---|---|
| 0x12 | NTT_FW | 600 |
| 0x13 | NTT_INV | 600 |
| 0x14 | VECMULMOD | variable |
| 0x15 | VECADDMOD | variable |
| 0x16 | SHAKE | variable |
| **0x17** | **FALCON_VERIFY** | **2,800** |
| 0x18 | LP_NORM | 400 |
| 0x19 | VECSUBMOD | variable |
| 0x1a | EXPAND_A_VECMUL | variable |
| **0x1b** | **DILITHIUM_VERIFY** | **~119,000** |

## Known Issues

- **First build is slow**: The Erigon PQ Docker image includes Rust CGO compilation (~10–20 min). Subsequent runs skip the build.
- **RPC port is dynamic**: Kurtosis assigns a random host port. Always read from `chain/rpc_url.txt`, never hardcode 8545.
- **Resource usage**: The enclave needs ~4 GB RAM. Close other Docker containers if resources are tight.
- **Idempotent start**: Running `start.sh` twice destroys the old enclave first.
