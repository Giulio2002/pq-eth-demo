# Explorer Agent — Success Criteria

## One-sentence goal

Build a block explorer (Next.js, port 3001) that lists blocks, transactions, and wallets on the PQ devnet, prominently displaying which post-quantum signature scheme (Falcon-512 or ML-DSA-44) was used for each transaction.

---

## Verification Commands

### 1. npm install succeeds

```bash
cd explorer
npm install 2>&1
echo "Exit code: $?"
```

### 2. Next.js builds

```bash
cd explorer
npm run build 2>&1
echo "Exit code: $?"
# Must exit 0
```

### 3. Dev server starts on port 3001

```bash
cd explorer
npm run dev &
EXPLORER_PID=$!
sleep 8

curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200" \
  && echo "OK: explorer serves on :3001" \
  || echo "FAIL: not responding"

kill $EXPLORER_PID 2>/dev/null
```

### 4. All pages render

```bash
cd explorer
npm run dev &
EXPLORER_PID=$!
sleep 8

for PAGE in "/" "/blocks" "/transactions" "/wallets"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001$PAGE")
  [ "$CODE" = "200" ] && echo "OK: $PAGE ($CODE)" || echo "FAIL: $PAGE ($CODE)"
done

kill $EXPLORER_PID 2>/dev/null
```

### 5. Algorithm badge component exists and distinguishes schemes

```bash
cd explorer
grep -l "AlgorithmBadge\|algorithmBadge\|algorithm-badge" src/components/*.tsx \
  && echo "OK: AlgorithmBadge component found"

# Verify it handles all schemes
grep -c "falcon-direct\|falcon-ntt\|dilithium-direct\|dilithium-ntt\|ecdsa\|7702" src/components/AlgorithmBadge.tsx \
  | python3 -c "import sys; n=int(sys.stdin.read()); assert n >= 6; print(f'OK: {n} scheme references')"
```

### 6. Transaction detail page shows signature scheme

```bash
cd explorer
# Check that the tx detail page references signature scheme
grep -l "signatureScheme\|signature_scheme\|algorithm" src/app/tx/\\[hash\\]/page.tsx \
  && echo "OK: tx detail shows signature scheme"
```

### 7. Key files exist

```bash
for F in \
  explorer/package.json \
  explorer/next.config.js \
  explorer/tsconfig.json \
  explorer/tailwind.config.ts \
  explorer/README.md \
  explorer/src/app/layout.tsx \
  explorer/src/app/page.tsx \
  explorer/src/app/blocks/page.tsx \
  explorer/src/app/transactions/page.tsx \
  explorer/src/app/wallets/page.tsx \
  explorer/src/lib/api.ts \
  explorer/src/lib/utils.ts \
  explorer/src/components/AlgorithmBadge.tsx \
  explorer/src/components/TxRow.tsx \
  explorer/src/components/BlockRow.tsx; do
  test -f "$F" && echo "OK: $F" || echo "FAIL: $F missing"
done
```

### 8. Port 3001 configured

```bash
cd explorer
grep -q "3001" package.json && echo "OK: port 3001 in package.json" || echo "FAIL"
```

### 9. TypeScript compiles

```bash
cd explorer
npx tsc --noEmit 2>&1
echo "Exit code: $?"
```

### 10. Dark theme applied

```bash
cd explorer
# Check tailwind config or layout for dark mode
grep -q "dark" explorer/tailwind.config.ts 2>/dev/null || \
grep -q "dark" explorer/src/app/layout.tsx 2>/dev/null || \
grep -q "bg-gray-9\|bg-slate-9\|bg-zinc-9\|bg-neutral-9" explorer/src/app/layout.tsx 2>/dev/null
echo "Verify dark theme visually"
```

## Success Criteria

- [ ] `npm install` exits 0
- [ ] `npm run build` exits 0 (Next.js production build)
- [ ] Dev server starts on port **3001** (not 3000)
- [ ] `/` dashboard: shows chain stats, algorithm breakdown, recent transactions, recent blocks
- [ ] `/blocks` page: paginated block list with PQ tx counts
- [ ] `/block/:number` page: block detail with transaction list showing signature scheme badges
- [ ] `/transactions` page: paginated transaction list, each row has a **signature scheme badge**
- [ ] `/tx/:hash` page: full transaction detail with dedicated **Signature Scheme section** showing algorithm name, verification approach (Direct vs NTT/Lego), precompile/verifier address, verification gas cost, and for NTT types the list of building-block precompiles used
- [ ] `/address/:address` page: address detail, shows PQ wallet info (algorithm, public key, nonce) if applicable
- [ ] `/wallets` page: directory of all PQ wallets, filterable by algorithm
- [ ] `AlgorithmBadge` component: Falcon Direct = blue, Falcon NTT = teal + "Lego", Dilithium Direct = purple, Dilithium NTT = pink + "Lego", ECDSA = gray, 7702 = amber
- [ ] Auto-refresh: dashboard updates every 5 seconds
- [ ] Dark theme with PQ-themed accents
- [ ] All API calls target backend port 8546 (via `/api/explorer/*` endpoints)
- [ ] Empty states: pages handle gracefully when no data exists yet
- [ ] Hex values truncated with copy-to-clipboard functionality
- [ ] ETH values shown with USD equivalent (from pool price)
- [ ] TypeScript compiles without errors
- [ ] README.md documents setup and features

## Known Gotchas

### Backend explorer endpoints
The explorer depends on `/api/explorer/*` endpoints in the backend. These are specified in the backend spec. If the backend agent hasn't implemented them yet, the explorer should handle API errors gracefully (show loading/error states, not crash).

### Port conflict
Port 3001 must not conflict with the frontend (port 3000). Ensure `package.json` scripts use `-p 3001`.

### Algorithm detection
The explorer doesn't detect algorithms itself — it reads the `signatureScheme` or `algorithm` field from the backend's API responses. The backend joins transaction data with the wallet DB to provide this.

### Non-PQ transactions
The chain may have non-PQ transactions (e.g., contract deployments, direct transfers from funded accounts). These should show "ECDSA" badge, not be hidden.
