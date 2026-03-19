# Backend Agent — Success Criteria

## One-sentence goal

Build a Go HTTP server (port 8546) that deploys PQ smart wallets, relays PQ-signed transactions to the chain, indexes events, and provides asset/transaction queries — without ever handling private keys.

---

## Verification Commands

### 1. Compiles

```bash
cd backend && go build ./... && echo "OK: build succeeded"
```

### 2. Starts and health check

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4
curl -s http://localhost:8546/health \
  | python3 -c "import json,sys; r=json.load(sys.stdin); assert r['status']=='ok'; print('OK: health', r)"
kill $BACKEND_PID 2>/dev/null
```

### 3. Wallet creation

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

# Create all 4 wallet types
PK_FALCON=$(python3 -c "print('0x' + 'ab' * 897)")
PK_DILITHIUM=$(python3 -c "print('0x' + 'cd' * 1312)")

for ALG in "falcon-direct" "falcon-ntt" "dilithium-direct" "dilithium-ntt"; do
  if echo "$ALG" | grep -q "falcon"; then
    PK="$PK_FALCON"
  else
    PK="$PK_DILITHIUM"
  fi
  RESULT=$(curl -s -X POST http://localhost:8546/api/wallet/create \
    -H "Content-Type: application/json" \
    -d "{\"publicKey\":\"$PK\",\"algorithm\":\"$ALG\"}")
  echo "$RESULT" | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert 'walletAddress' in r, f'Missing walletAddress for $ALG: {r}'
assert r['walletAddress'].startswith('0x'), f'Bad address: {r}'
print(f'OK: $ALG wallet at {r[\"walletAddress\"]}')
"
done

kill $BACKEND_PID 2>/dev/null
```

### 4. Wallet info query

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

# Create wallet first
PK=$(python3 -c "print('0x' + 'ab' * 897)")
ADDR=$(curl -s -X POST http://localhost:8546/api/wallet/create \
  -H "Content-Type: application/json" \
  -d "{\"publicKey\":\"$PK\",\"algorithm\":\"falcon\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['walletAddress'])")

# Query wallet info
curl -s "http://localhost:8546/api/wallet/$ADDR" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert r['algorithm'] == 'falcon', f'Wrong algorithm: {r}'
assert 'ethBalance' in r
assert 'nonce' in r
print(f'OK: wallet info retrieved, nonce={r[\"nonce\"]}')
"

# Query assets
curl -s "http://localhost:8546/api/wallet/$ADDR/assets" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert 'eth' in r and 'usd' in r and 'weth' in r
print(f'OK: assets - ETH={r[\"eth\"]}, USD={r[\"usd\"]}, WETH={r[\"weth\"]}')
"

kill $BACKEND_PID 2>/dev/null
```

### 5. Input validation

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

# Wrong key size for falcon (should be 897 bytes, sending 100)
PK_BAD=$(python3 -c "print('0x' + 'ab' * 100)")
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8546/api/wallet/create \
  -H "Content-Type: application/json" \
  -d "{\"publicKey\":\"$PK_BAD\",\"algorithm\":\"falcon\"}")
[ "$HTTP_CODE" -ge "400" ] && echo "OK: bad key size rejected ($HTTP_CODE)" || echo "FAIL: accepted bad key"

# Invalid algorithm
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8546/api/wallet/create \
  -H "Content-Type: application/json" \
  -d "{\"publicKey\":\"0xab\",\"algorithm\":\"kyber\"}")
[ "$HTTP_CODE" -ge "400" ] && echo "OK: bad algorithm rejected ($HTTP_CODE)" || echo "FAIL: accepted bad alg"

kill $BACKEND_PID 2>/dev/null
```

### 6. Message hash endpoint

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

# Create wallet
PK=$(python3 -c "print('0x' + 'ab' * 897)")
ADDR=$(curl -s -X POST http://localhost:8546/api/wallet/create \
  -H "Content-Type: application/json" \
  -d "{\"publicKey\":\"$PK\",\"algorithm\":\"falcon\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['walletAddress'])")

# Get message hash for execute
curl -s -X POST http://localhost:8546/api/wallet/execute-message \
  -H "Content-Type: application/json" \
  -d "{\"wallet\":\"$ADDR\",\"to\":\"0x0000000000000000000000000000000000000001\",\"value\":\"0x0\",\"data\":\"0x\"}" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert 'messageHash' in r and r['messageHash'].startswith('0x')
assert 'nonce' in r
assert 'chainId' in r
print(f'OK: message hash = {r[\"messageHash\"][:20]}..., nonce={r[\"nonce\"]}')
"

kill $BACKEND_PID 2>/dev/null
```

### 7. Chain info endpoints

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

curl -s http://localhost:8546/api/chain/block \
  | python3 -c "import json,sys; r=json.load(sys.stdin); assert int(r.get('blockNumber',0)) > 0; print('OK: block', r['blockNumber'])"

curl -s http://localhost:8546/api/chain/pool-price \
  | python3 -c "import json,sys; r=json.load(sys.stdin); assert 'price' in r; print('OK: ETH-USD price =', r['price'])"

kill $BACKEND_PID 2>/dev/null
```

### 8. Explorer endpoints

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

# Stats
curl -s http://localhost:8546/api/explorer/stats \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert 'totalWallets' in r
assert 'falconWallets' in r
assert 'dilithiumWallets' in r
assert 'totalTransactions' in r
print(f'OK: stats - {r[\"totalWallets\"]} wallets, {r[\"totalTransactions\"]} txs')
"

# Recent transactions
curl -s "http://localhost:8546/api/explorer/recent-transactions?limit=10" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert isinstance(r, list)
if len(r) > 0:
    assert 'signatureScheme' in r[0], f'Missing signatureScheme: {r[0]}'
    assert r[0]['signatureScheme'] in ('falcon', 'dilithium', 'ecdsa')
print(f'OK: {len(r)} recent transactions')
"

# Recent blocks
curl -s "http://localhost:8546/api/explorer/recent-blocks?limit=5" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert isinstance(r, list)
print(f'OK: {len(r)} recent blocks')
"

# Wallet directory
curl -s "http://localhost:8546/api/explorer/wallets?limit=10" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)
assert isinstance(r, list)
if len(r) > 0:
    assert 'algorithm' in r[0]
print(f'OK: {len(r)} wallets in directory')
"

kill $BACKEND_PID 2>/dev/null
```

### 9. CORS headers

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4

CORS=$(curl -s -I -X OPTIONS http://localhost:8546/api/wallet/create \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" 2>&1 | grep -i "access-control-allow-origin")
echo "$CORS" | grep -q "localhost:3000" && echo "OK: CORS allows localhost:3000" || echo "FAIL: CORS missing"

kill $BACKEND_PID 2>/dev/null
```

### 9. No private key exposure

```bash
# Grep entire backend directory for private key storage/logging
cd backend
! grep -r "privateKey\|private_key\|secretKey\|secret_key" --include="*.go" \
  | grep -v "PAYER_PRIVATE_KEY\|payerKey\|PayerPrivateKey\|payer" \
  | grep -v "_test.go" \
  | grep -v "config.go" \
  && echo "OK: no user private key handling found" \
  || echo "WARN: check for private key handling"

# The only private key the backend touches should be the PAYER account
echo "Verify: backend only uses payer key (from env var), never user PQ private keys"
```

### 10. Docker builds

```bash
cd backend && docker build -t pq-backend . 2>&1 | tail -3 && echo "OK: Docker build"
```

### 11. Graceful shutdown

```bash
cd backend && go run . &
BACKEND_PID=$!
sleep 4
kill -SIGTERM $BACKEND_PID
wait $BACKEND_PID 2>/dev/null
echo "OK: process exited cleanly (exit code: $?)"
```

## Success Criteria

- [ ] `go build ./...` exits 0
- [ ] `/health` returns `{"status":"ok"}` with chain block and payer balance
- [ ] `POST /api/wallet/create` deploys all 4 wallet types: falcon-direct, dilithium-direct, falcon-ntt, dilithium-ntt
- [ ] Falcon variants accept 897-byte public keys, Dilithium variants accept 1312-byte public keys
- [ ] Invalid key sizes, unknown algorithms, and mismatched key/algorithm combos are rejected (400+)
- [ ] `GET /api/wallet/:address` returns wallet info with algorithm, nonce, balance
- [ ] `GET /api/wallet/:address/assets` returns ETH, WETH, USD balances
- [ ] `POST /api/wallet/execute-message` returns correct message hash for signing
- [ ] `POST /api/wallet/swap-message` returns correct batch message hash for swap signing
- [ ] `GET /api/chain/block` returns current block number
- [ ] `GET /api/chain/pool-price` returns ETH-USD price from the Uniswap pool
- [ ] `GET /api/explorer/stats` returns totalWallets, falconWallets, dilithiumWallets, totalTransactions
- [ ] `GET /api/explorer/recent-transactions` returns list with `signatureScheme` field per transaction
- [ ] `GET /api/explorer/recent-blocks` returns list of recent blocks
- [ ] `GET /api/explorer/wallets` returns filterable wallet directory with algorithm field
- [ ] `GET /api/explorer/tx/:hash` returns tx detail with signatureScheme, publicKey, precompileAddress
- [ ] `GET /api/explorer/address/:address` returns isPQWallet + wallet details if applicable
- [ ] CORS allows `http://localhost:3000` and `http://localhost:3001`
- [ ] Backend NEVER stores, logs, or transmits user PQ private keys
- [ ] Docker image builds
- [ ] Graceful shutdown on SIGTERM
- [ ] SQLite database created with correct schema
- [ ] All Go files compile without warnings
- [ ] README.md documents setup and API

## Known Gotchas

- `modernc.org/sqlite` needs blank import `_ "modernc.org/sqlite"` in main.go for driver init
- `deployments.json` must exist before backend starts — chain and contracts agents must run first
- Payer account needs sufficient ETH — if balance is low, wallet creation/relay will fail
- go-ethereum's `ethclient` uses `context.Context` — always use `context.WithTimeout`
- The factory's `WalletCreated` event ABI must match exactly what the contract emits
- For EIP-7702: if go-ethereum 1.14.12 doesn't support 7702 transaction type natively, the backend should construct raw transactions or use a placeholder that returns an informative error
