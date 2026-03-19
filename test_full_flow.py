#!/usr/bin/env python3
"""
Simulate the EXACT browser→backend→contract→precompile flow.
Uses the pqcrypto library (known to work) but decodes the sig the same way
the WASM module does, to verify the decode logic is correct.
"""
import json, subprocess, sys

RPC = open("chain/rpc_url.txt").read().strip()
Q = 12289
N = 512

def rpc(method, params):
    r = subprocess.run(["curl","-s","-X","POST",RPC,"-H","Content-Type: application/json",
        "-d",json.dumps({"jsonrpc":"2.0","method":method,"params":params,"id":1})],
        capture_output=True, text=True)
    return json.loads(r.stdout).get("result")

def eth_call(to, data_hex):
    return rpc("eth_call", [{"to":to,"data":data_hex,"gas":"0xFFFFFF"},"latest"])

def coeffs_to_flat(c): return b"".join(x.to_bytes(2,"big") for x in c)

class BitReader:
    def __init__(self, d): self.d, self.p = d, 0
    def bit(self):
        r = (self.d[self.p//8] >> (7-self.p%8)) & 1 if self.p//8 < len(self.d) else 0
        self.p += 1; return r
    def bits(self, n):
        v = 0
        for _ in range(n): v = (v<<1)|self.bit()
        return v

def decode_pk(pk):
    d = pk[1:]
    h, bp = [], 0
    for _ in range(N):
        v = 0
        for _ in range(14):
            v = (v<<1)|((d[bp//8]>>(7-bp%8))&1)
            bp += 1
        h.append(v)
    return h

def decode_sig(sig):
    """Same algorithm as WASM decode_falcon_sig_for_precompile"""
    nonce = sig[1:41]
    r = BitReader(sig[41:])
    s2 = []
    for _ in range(N):
        sign = r.bit()
        low = r.bits(7)
        high = 0
        while r.bit() == 0: high += 1
        mag = (high<<7)|low
        s2.append((Q-mag)%Q if sign else mag%Q)
    return nonce, s2

def ntt_fwd(h):
    hdr = N.to_bytes(32,"big") + Q.to_bytes(32,"big") + (49).to_bytes(32,"big")
    res = eth_call("0x0000000000000000000000000000000000000012", "0x"+(hdr+coeffs_to_flat(h)).hex())
    return [int.from_bytes(bytes.fromhex(res[2:])[i*2:i*2+2],"big") for i in range(N)]

# ── Step 1: Create wallet via backend API ──
print("=== Testing full flow ===\n")

from pqcrypto.sign.falcon_512 import generate_keypair, sign
pk, sk = generate_keypair()
pk_hex = "0x" + bytes(pk).hex()
print(f"1. Generated keypair: pk={len(bytes(pk))} bytes")

# Create wallet
print("2. Creating wallet via backend...")
r = subprocess.run(["curl","-s","-X","POST","http://localhost:8546/api/wallet/create",
    "-H","Content-Type: application/json",
    "-d",json.dumps({"publicKey":pk_hex,"algorithm":"falcon-direct"})],
    capture_output=True, text=True)
wallet_data = json.loads(r.stdout)
wallet_addr = wallet_data.get("walletAddress","")
print(f"   Wallet: {wallet_addr}")
if not wallet_addr or wallet_addr == "FAIL":
    print(f"   FAILED: {r.stdout}")
    sys.exit(1)

# ── Step 2: Get message hash ──
print("3. Getting message hash...")
to = "0x0000000000000000000000000000000000000001"
value = "0x16345785D8A0000"  # 0.1 ETH
r = subprocess.run(["curl","-s","-X","POST","http://localhost:8546/api/wallet/execute-message",
    "-H","Content-Type: application/json",
    "-d",json.dumps({"wallet":wallet_addr,"to":to,"value":value,"data":"0x"})],
    capture_output=True, text=True)
msg_data = json.loads(r.stdout)
msg_hash = msg_data["messageHash"]
print(f"   messageHash: {msg_hash[:20]}...")

# ── Step 3: Sign with pqcrypto ──
msg_bytes = bytes.fromhex(msg_hash[2:])
sig_raw = bytes(sign(sk, msg_bytes))
print(f"4. Signed: sig={len(sig_raw)} bytes, header=0x{sig_raw[0]:02x}")

# ── Step 4: Decode signature (same as WASM does) ──
nonce, s2 = decode_sig(sig_raw)
s2_flat = coeffs_to_flat(s2)
decoded_sig = s2_flat + nonce  # 1064 bytes
print(f"5. Decoded sig: {len(decoded_sig)} bytes (s2={len(s2_flat)} + nonce={len(nonce)})")

# ── Step 5: Test directly against precompile ──
# Read the wallet's stored verifyKey (ntth) via SSTORE2
# First get the verifyKeyPointer
vk_ptr = rpc("eth_call", [{"to":wallet_addr,"data":"0x"+bytes.fromhex("d3950ffc").hex(),"gas":"0xFFFFF"},"latest"])
# Actually let's just use our Python NTT computation
h = decode_pk(bytes(pk))
ntth = ntt_fwd(h)
ntth_flat = coeffs_to_flat(ntth)

precompile_input = s2_flat + ntth_flat + nonce + msg_bytes
print(f"6. Precompile input: {len(precompile_input)} bytes")
result = eth_call("0x0000000000000000000000000000000000000017", "0x"+precompile_input.hex())
print(f"   Precompile result: {result}")
val = int(result, 16) if result else 0
if val == 1:
    print(f"\n   ✓ DIRECT PRECOMPILE VERIFICATION PASSED")
else:
    print(f"\n   ✗ DIRECT PRECOMPILE FAILED (returned {val})")
    sys.exit(1)

# ── Step 6: Now test via the contract ──
print(f"\n7. Testing via contract execute()...")
sig_hex = "0x" + decoded_sig.hex()
r = subprocess.run(["curl","-s","-X","POST","http://localhost:8546/api/wallet/execute",
    "-H","Content-Type: application/json",
    "-d",json.dumps({"wallet":wallet_addr,"to":to,"value":value,"data":"0x","signature":sig_hex})],
    capture_output=True, text=True)
exec_result = json.loads(r.stdout)
print(f"   Result: {json.dumps(exec_result)}")
if exec_result.get("success"):
    print(f"\n   ✓✓✓ FULL END-TO-END VERIFICATION PASSED ✓✓✓")
else:
    print(f"\n   ✗ CONTRACT EXECUTION FAILED")
    print(f"   The precompile works directly but the contract call fails.")
    print(f"   This means the contract's Yul code is assembling the input differently.")
