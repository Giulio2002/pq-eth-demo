# Chain Agent — Success Criteria

## One-sentence goal

Build and run a Kurtosis-managed Ethereum devnet with Erigon (PQ precompiles branch) and Prysm, producing blocks with functional PQ precompiles at addresses 0x17 and 0x1b, and pre-funded accounts.

---

## Verification Commands

### 1. Docker image exists

```bash
docker image inspect erigon-pq:local &>/dev/null && echo "OK: Image exists" || echo "FAIL: No image"
```

### 2. Kurtosis enclave running

```bash
kurtosis enclave inspect pq-demo 2>&1 | head -20
# Must show a running enclave with EL and CL services
```

### 3. RPC URL file exists and is valid

```bash
test -f chain/rpc_url.txt && echo "OK: rpc_url.txt exists" || echo "FAIL: no rpc_url.txt"
RPC_URL=$(cat chain/rpc_url.txt)
echo "RPC: $RPC_URL"
curl -s -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin); print('OK: net_version', r.get('result','?'))"
```

### 4. Chain producing blocks

```bash
RPC_URL=$(cat chain/rpc_url.txt)
B1=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | python3 -c "import json,sys; print(int(json.load(sys.stdin)['result'],16))")
sleep 6
B2=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | python3 -c "import json,sys; print(int(json.load(sys.stdin)['result'],16))")
[ "$B2" -gt "$B1" ] && echo "OK: blocks advancing ($B1 → $B2)" || echo "FAIL: blocks stalled"
```

### 5. Accounts are funded

```bash
RPC_URL=$(cat chain/rpc_url.txt)
for ADDR in \
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" \
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" \
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; do
  BAL=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBalance\",\"params\":[\"$ADDR\",\"latest\"],\"id\":1}" \
    | python3 -c "import json,sys; print(int(json.load(sys.stdin)['result'],16))")
  [ "$BAL" -gt "0" ] && echo "OK: $ADDR funded" || echo "FAIL: $ADDR has 0 balance"
done
```

### 6. PQ precompiles are reachable

```bash
RPC_URL=$(cat chain/rpc_url.txt)

# Falcon verify (0x17) — should return a result or a revert, NOT a node error/panic
curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x0000000000000000000000000000000000000017","data":"0x00","gas":"0xFFFFF"},"latest"],"id":1}' \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
if 'result' in r or 'error' in r:
    print('OK: Falcon precompile (0x17) reachable')
else:
    print('FAIL: unexpected response', r)
"

# Dilithium verify (0x1b)
curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x000000000000000000000000000000000000001b","data":"0x00","gas":"0xFFFFF"},"latest"],"id":1}' \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
if 'result' in r or 'error' in r:
    print('OK: Dilithium precompile (0x1b) reachable')
else:
    print('FAIL: unexpected response', r)
"
```

### 7. All scripts exist and are executable

```bash
for F in chain/start.sh chain/stop.sh chain/test_precompiles.sh chain/get_rpc_url.sh chain/network_params.yaml chain/README.md; do
  test -f "$F" && echo "OK: $F exists" || echo "FAIL: $F missing"
done
for F in chain/start.sh chain/stop.sh chain/test_precompiles.sh chain/get_rpc_url.sh; do
  test -x "$F" && echo "OK: $F executable" || echo "FAIL: $F not executable"
done
```

### 8. Stop script works

```bash
bash chain/stop.sh
kurtosis enclave inspect pq-demo 2>&1 | grep -q "No enclave" && echo "OK: enclave removed" || echo "WARN: enclave may still exist"
```

## Success Criteria

- [ ] Erigon PQ Docker image (`erigon-pq:local`) builds successfully from the `docker_pq-precompiles` branch
- [ ] Kurtosis enclave `pq-demo` is running with Erigon (EL) + Prysm (CL)
- [ ] Chain RPC is accessible and responding to JSON-RPC calls
- [ ] Blocks are advancing (not stalled) with ~2 second slot times
- [ ] Deployer, Payer, and Liquidity accounts all have >0 ETH balance
- [ ] Falcon precompile (0x17) is reachable via `eth_call` (returns result or revert, no panic)
- [ ] Dilithium precompile (0x1b) is reachable via `eth_call` (returns result or revert, no panic)
- [ ] `chain/rpc_url.txt` contains the correct dynamically-assigned RPC URL
- [ ] All scripts (start.sh, stop.sh, test_precompiles.sh, get_rpc_url.sh) exist and are executable
- [ ] `chain/stop.sh` cleanly removes the Kurtosis enclave
- [ ] `chain/README.md` documents prerequisites and usage
- [ ] `start.sh` is idempotent — running it twice works (destroys old enclave first)
