# Chain Agent

## Your Responsibility

Set up and run the post-quantum Ethereum devnet using Kurtosis with Erigon (PQ precompiles branch) as the execution layer and Prysm as the consensus layer. You own the `chain/` directory.

**Do not touch** `contracts/`, `backend/`, or `frontend/`.

---

## What to Build

### 1. Erigon PQ Docker Image

Build a Docker image from the Erigon `docker_pq-precompiles` branch:

```bash
git clone --branch docker_pq-precompiles --depth 1 https://github.com/erigontech/erigon.git /tmp/erigon-pq
cd /tmp/erigon-pq
docker build -t erigon-pq:local -f Dockerfile .
```

The resulting image includes the PQ precompiles (addresses 0x12–0x1b) compiled from the Rust `pq-eth-precompiles` library via CGO. This build may take 10–20 minutes due to Rust compilation.

### 2. Kurtosis Devnet Configuration

Create `chain/network_params.yaml` for the `ethereum-package`. The configuration must specify:

- **EL client**: Erigon with the custom `erigon-pq:local` image
- **CL client**: Prysm (use latest stable images from `gcr.io/prysmaticlabs/prysm/`)
- **Slot time**: 2 seconds (fast for demo responsiveness)
- **Pre-funded accounts**: Deployer, Payer, and Liquidity provider addresses each with at least 10,000 ETH
- **Network ID**: 3151908 (Kurtosis default)

**Important**: The exact YAML schema depends on the `ethereum-package` version. Before writing the config, run:

```bash
kurtosis run github.com/ethpandaops/ethereum-package --help
```

And examine the `ethereum-package` README or example configs. The pq-eth-precompiles repo at `github.com/Giulio2002/pq-eth-precompiles` may also contain a reference Kurtosis config — check it for the correct format for running Erigon with PQ precompiles in Kurtosis.

Pre-funded accounts (each with 10,000+ ETH):

| Role      | Address                                    |
|-----------|--------------------------------------------|
| Deployer  | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |
| Payer     | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 |
| Liquidity | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC |
| Reserve   | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 |

### 3. Start Script (`chain/start.sh`)

A single script that:
1. Checks prerequisites (Docker running, Kurtosis CLI installed, Git)
2. Builds the Erigon PQ Docker image if `erigon-pq:local` does not exist
3. Destroys any existing `pq-demo` Kurtosis enclave
4. Starts the Kurtosis devnet with the config
5. Extracts the EL RPC port from Kurtosis enclave inspection and writes it to `chain/rpc_url.txt`
6. Waits for the chain to produce blocks (poll `eth_blockNumber` up to 120 seconds)
7. Verifies that pre-funded accounts have balances
8. Prints success message with the RPC URL

The script must be idempotent — running it twice should work (destroys old enclave first).

### 4. Stop Script (`chain/stop.sh`)

Tears down the Kurtosis enclave:

```bash
#!/bin/bash
kurtosis enclave rm -f pq-demo 2>/dev/null || true
echo "[chain] Devnet stopped."
```

### 5. PQ Precompile Test Script (`chain/test_precompiles.sh`)

Verifies PQ precompiles are functional:
1. Read RPC URL from `chain/rpc_url.txt`
2. Test SHAKE precompile (0x16) — simplest smoke test
3. Test FALCON_VERIFY (0x17) reachability — call with minimal data, expect a response (error is OK, panic is not)
4. Test DILITHIUM_VERIFY (0x1b) reachability — same approach
5. Verify standard EVM works (`eth_blockNumber`, `eth_getBalance`)
6. Print pass/fail for each test

### 6. RPC URL Helper (`chain/get_rpc_url.sh`)

```bash
#!/bin/bash
cat "$(dirname "$0")/rpc_url.txt" 2>/dev/null || echo "http://127.0.0.1:8545"
```

### 7. README.md

Document prerequisites, how to start/stop, how to test, and known issues.

## File Structure

```
chain/
  network_params.yaml     — Kurtosis ethereum-package config
  start.sh                — Build image + start devnet + verify
  stop.sh                 — Tear down devnet
  test_precompiles.sh     — Verify PQ precompiles work
  get_rpc_url.sh          — Print active RPC URL
  rpc_url.txt             — Written by start.sh at runtime
  README.md               — Setup docs
```

## Prerequisites

The agent must verify these are installed:
- Docker (running, with at least 4GB RAM available)
- Kurtosis CLI (`kurtosis version`)
- Git
- curl
- python3

If Kurtosis is not installed:
```bash
brew install kurtosis-tech/tap/kurtosis-cli  # macOS
# or: curl -sSL https://get.kurtosis.com | bash
```

## Important Notes

- The Erigon PQ Docker build from the `docker_pq-precompiles` branch includes Rust CGO compilation — expect 10–20 min build time
- Kurtosis requires Docker with sufficient resources (4GB+ RAM for the enclave)
- The RPC port is dynamically assigned by Kurtosis — always read from `chain/rpc_url.txt`, never hardcode 8545
- The chain agent does NOT deploy contracts — that is the contracts agent's responsibility
- If the `ethereum-package` YAML schema is incorrect, consult the ethereum-package README and example configs
- Prysm images: `gcr.io/prysmaticlabs/prysm/beacon-chain:latest` and `gcr.io/prysmaticlabs/prysm/validator:latest`
- All scripts must be executable (`chmod +x`)
- Use `set -e` in all scripts for fail-fast behavior
