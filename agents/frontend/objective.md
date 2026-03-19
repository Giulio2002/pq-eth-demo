# Frontend Agent — Success Criteria

## One-sentence goal

Build a Next.js wallet UI that generates PQ keypairs in the browser via WASM, deploys smart wallets through the backend, and provides send ETH / swap ETH-USD / view assets functionality — with the private key never leaving the browser.

---

## Verification Commands

### 1. WASM module builds

```bash
cd frontend/pq-wasm
wasm-pack build --target web --release 2>&1
echo "Exit code: $?"
# Must exit 0, producing pkg/ directory
test -f pkg/pq_wasm_bg.wasm && echo "OK: WASM binary exists" || echo "FAIL"
test -f pkg/pq_wasm.js && echo "OK: JS bindings exist" || echo "FAIL"
```

### 2. npm install succeeds

```bash
cd frontend
npm install 2>&1
echo "Exit code: $?"
```

### 3. Next.js builds

```bash
cd frontend
npm run build 2>&1
echo "Exit code: $?"
# Must exit 0 — no TypeScript errors, no build failures
```

### 4. Dev server starts

```bash
cd frontend
npm run dev &
FRONTEND_PID=$!
sleep 8

# Check that the server responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200" \
  && echo "OK: frontend serves on :3000" \
  || echo "FAIL: frontend not responding"

kill $FRONTEND_PID 2>/dev/null
```

### 5. PQ WASM functionality (Node.js smoke test)

```bash
cd frontend
node -e "
const fs = require('fs');
const path = require('path');

// Verify the WASM pkg directory exists with expected files
const pkgDir = path.join(__dirname, 'pq-wasm', 'pkg');
const files = fs.readdirSync(pkgDir);
const hasWasm = files.some(f => f.endsWith('.wasm'));
const hasJs = files.some(f => f.endsWith('.js'));
console.log('WASM files:', files.filter(f => f.endsWith('.wasm') || f.endsWith('.js')));
console.assert(hasWasm, 'Missing .wasm file');
console.assert(hasJs, 'Missing .js bindings');
console.log('OK: WASM package structure valid');
"
```

### 6. Key files exist

```bash
for F in \
  frontend/package.json \
  frontend/next.config.js \
  frontend/tsconfig.json \
  frontend/tailwind.config.ts \
  frontend/build.sh \
  frontend/README.md \
  frontend/pq-wasm/Cargo.toml \
  frontend/pq-wasm/src/lib.rs \
  frontend/src/app/layout.tsx \
  frontend/src/app/page.tsx \
  frontend/src/app/create/page.tsx \
  frontend/src/app/send/page.tsx \
  frontend/src/app/swap/page.tsx \
  frontend/src/lib/api.ts \
  frontend/src/lib/pq.ts \
  frontend/src/lib/wallet-store.ts; do
  test -f "$F" && echo "OK: $F" || echo "FAIL: $F missing"
done
```

### 7. No private key in API calls

```bash
cd frontend
# Verify api.ts never sends secretKey/privateKey to the backend
! grep -n "secretKey\|privateKey\|secret_key\|private_key" src/lib/api.ts \
  && echo "OK: api.ts does not reference private keys" \
  || echo "WARN: check api.ts for private key references"

# Verify only publicKey is sent in wallet creation
grep -n "publicKey" src/lib/api.ts | head -5
echo "(should only appear in createWallet context)"
```

### 8. Build script works end-to-end

```bash
cd frontend
bash build.sh 2>&1
echo "Exit code: $?"
# Must exit 0 — builds WASM, installs deps, builds Next.js
```

### 9. Pages render without errors

```bash
cd frontend
npm run dev &
FRONTEND_PID=$!
sleep 8

for PAGE in "/" "/create" "/send" "/swap" "/settings"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$PAGE")
  [ "$CODE" = "200" ] && echo "OK: $PAGE ($CODE)" || echo "FAIL: $PAGE ($CODE)"
done

kill $FRONTEND_PID 2>/dev/null
```

### 10. TypeScript strict mode

```bash
cd frontend
npx tsc --noEmit 2>&1
echo "Exit code: $?"
# Should exit 0 (no type errors)
```

## Success Criteria

- [ ] `wasm-pack build --target web` exits 0 — WASM module compiles from Rust
- [ ] WASM exposes `falcon_keygen`, `falcon_sign`, `dilithium_keygen`, `dilithium_sign`
- [ ] `npm install` exits 0
- [ ] `npm run build` exits 0 (Next.js production build)
- [ ] Dev server starts on port 3000 and serves pages
- [ ] `/create` page: selection between 4 wallet types (Falcon Direct, Falcon NTT, Dilithium Direct, Dilithium NTT) with comparison table showing gas costs and trade-offs (Direct = simpler/cheaper, NTT/Lego = transparent/auditable)
- [ ] `/create` page: "Generate Keypair" button invokes WASM keygen (same keygen for Direct and NTT variants)
- [ ] `/create` page: "Deploy Wallet" sends publicKey + algorithm string (NOT secretKey) to backend
- [ ] `/` (dashboard): shows wallet address, algorithm badge, asset balances, recent transactions
- [ ] `/send` page: recipient address + amount input → sign message hash → relay via backend
- [ ] `/swap` page: ETH↔USD direction toggle → amount input → sign → relay
- [ ] `/settings` page: view wallet info, delete wallet
- [ ] PQ private keys stored in IndexedDB (or localStorage), NEVER sent to any API
- [ ] All API calls go to backend (port 8546), never directly to chain
- [ ] Hex encoding correct: public keys and signatures use `0x`-prefixed hex
- [ ] Tailwind CSS dark theme — clean, professional appearance
- [ ] `build.sh` runs end-to-end (WASM build → npm install → Next.js build)
- [ ] TypeScript compiles without errors
- [ ] README.md documents setup and development

## Known Gotchas

### WASM + Next.js SSR
WASM modules cannot be imported during server-side rendering. Use dynamic import with `ssr: false`:
```typescript
const PQModule = dynamic(() => import("../lib/pq"), { ssr: false });
```
Or initialize WASM in a `useEffect` hook (client-side only).

### WASM async initialization
The WASM module requires async initialization before any crypto functions can be called. The app must call `initPQ()` on load and show a loading state until ready.

### Rust WASM compilation
- `wasm32-unknown-unknown` target must be installed: `rustup target add wasm32-unknown-unknown`
- `wasm-pack` must be installed: `cargo install wasm-pack`
- `getrandom` crate needs the `js` feature for browser random number generation
- If `pqcrypto-falcon` fails to compile to WASM (it uses floating-point internally), fall back to a different library or use `liboqs` WASM build

### Key sizes
- Falcon-512: publicKey = 897 bytes, secretKey = 1281 bytes
- ML-DSA-44: publicKey = 1312 bytes, secretKey = 2560 bytes
- Validate sizes after keygen and before signing

### Message hash format
The smart wallet expects `keccak256(abi.encodePacked(to, value, data, nonce, chainId))` for `execute()` and `keccak256(abi.encode(targets, values, datas, nonce, chainId))` for `executeBatch()`. The frontend gets these hashes from the backend's message hash endpoints to ensure correctness — do NOT compute them independently in the frontend.

### IndexedDB storage
Uint8Array cannot be stored directly in all IndexedDB implementations. Use `ArrayBuffer` or encode as hex string. The `idb` npm package simplifies this.
