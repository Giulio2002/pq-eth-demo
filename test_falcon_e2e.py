#!/usr/bin/env python3
"""End-to-end Falcon-512 verification test against the live PQ chain precompile."""

import json, subprocess, struct, sys

RPC = open("chain/rpc_url.txt").read().strip()
Q = 12289
N = 512
NONCE_LEN = 40

def rpc_call(method, params):
    r = subprocess.run(["curl", "-s", "-X", "POST", RPC,
        "-H", "Content-Type: application/json",
        "-d", json.dumps({"jsonrpc":"2.0","method":method,"params":params,"id":1})],
        capture_output=True, text=True)
    return json.loads(r.stdout).get("result")

def eth_call(to, data):
    return rpc_call("eth_call", [{"to": to, "data": "0x" + data.hex(), "gas": "0xFFFFFF"}, "latest"])

def coeffs_to_flat(coeffs):
    return b"".join(c.to_bytes(2, "big") for c in coeffs)

# ── Decode standard Falcon pk (897 bytes) → 512 h coefficients ──
def decode_pk(pk_bytes):
    """Decode 14-bit packed h coefficients from standard 897-byte Falcon pk."""
    data = pk_bytes[1:]  # skip header
    h = []
    bit_pos = 0
    for _ in range(N):
        val = 0
        for b in range(14):
            byte_idx = bit_pos // 8
            bit_idx = 7 - (bit_pos % 8)
            val = (val << 1) | ((data[byte_idx] >> bit_idx) & 1)
            bit_pos += 1
        h.append(val)
    return h

# ── Decode standard Falcon sig → (nonce, s2 coefficients) ──
class BitReader:
    def __init__(self, data):
        self.data = data
        self.pos = 0
    def read_bit(self):
        byte_idx = self.pos // 8
        bit_idx = 7 - (self.pos % 8)
        self.pos += 1
        if byte_idx >= len(self.data):
            return 0
        return (self.data[byte_idx] >> bit_idx) & 1
    def read_bits(self, n):
        val = 0
        for _ in range(n):
            val = (val << 1) | self.read_bit()
        return val

def decode_sig(sig_bytes):
    nonce = sig_bytes[1:1+NONCE_LEN]
    comp = sig_bytes[1+NONCE_LEN:]
    reader = BitReader(comp)
    s2 = []
    for _ in range(N):
        sign_bit = reader.read_bit()
        low = reader.read_bits(7)
        high = 0
        while reader.read_bit() == 0:
            high += 1
        magnitude = (high << 7) | low
        if sign_bit:
            s2.append(Q - magnitude)
        else:
            s2.append(magnitude)
    return nonce, s2

# ── NTT forward via precompile 0x12 ──
def ntt_forward(h_coeffs):
    """Call NTT_FW precompile (0x12): header(96 bytes) + coeffs(1024 bytes)."""
    header = (N).to_bytes(32, "big") + (Q).to_bytes(32, "big") + (49).to_bytes(32, "big")
    coeffs_bytes = coeffs_to_flat(h_coeffs)
    input_data = header + coeffs_bytes
    result = eth_call("0x0000000000000000000000000000000000000012", input_data)
    if not result or result == "0x":
        return None
    result_bytes = bytes.fromhex(result[2:])
    # Parse 512 uint16 BE from result
    ntth = []
    for i in range(N):
        ntth.append(int.from_bytes(result_bytes[i*2:i*2+2], "big"))
    return ntth

# ── Main test ──
print("=== Falcon-512 End-to-End Precompile Test ===\n")

# 1. Generate keypair
from pqcrypto.sign.falcon_512 import generate_keypair, sign, verify
pk, sk = generate_keypair()
pk_bytes = bytes(pk)
sk_bytes = bytes(sk)
print(f"1. Generated keypair: pk={len(pk_bytes)} bytes, sk={len(sk_bytes)} bytes")
print(f"   pk header: 0x{pk_bytes[0]:02x}")

# 2. Sign a test message
msg = b"test message for falcon verification"
sig_bytes = bytes(sign(sk, msg))
print(f"2. Signed message: sig={len(sig_bytes)} bytes")
print(f"   sig header: 0x{sig_bytes[0]:02x}")

# Verify locally first
try:
    verify(pk, msg, sig_bytes)
    print(f"   Local verify: PASS")
except:
    print(f"   Local verify: FAIL (this should not happen!)")
    sys.exit(1)

# 3. Decode pk → h coefficients
h = decode_pk(pk_bytes)
print(f"3. Decoded pk: {len(h)} h coefficients, first 5: {h[:5]}")

# 4. NTT forward of h → ntth
ntth = ntt_forward(h)
if ntth is None:
    print("4. NTT forward FAILED (precompile 0x12 returned empty)")
    sys.exit(1)
print(f"4. NTT forward: {len(ntth)} ntth coefficients, first 5: {ntth[:5]}")

# 5. Decode signature → (nonce, s2)
nonce, s2 = decode_sig(sig_bytes)
print(f"5. Decoded sig: nonce={len(nonce)} bytes, s2={len(s2)} coefficients, first 5 s2: {s2[:5]}")

# 6. Build precompile 0x17 input: s2(1024) || ntth(1024) || nonce(40) || msg
s2_flat = coeffs_to_flat(s2)
ntth_flat = coeffs_to_flat(ntth)
precompile_input = s2_flat + ntth_flat + nonce + msg
print(f"6. Precompile input: {len(precompile_input)} bytes")
print(f"   s2_flat: {len(s2_flat)}, ntth_flat: {len(ntth_flat)}, nonce: {len(nonce)}, msg: {len(msg)}")

# 7. Call precompile 0x17
result = eth_call("0x0000000000000000000000000000000000000017", precompile_input)
print(f"7. Precompile 0x17 result: {result}")

if result and len(result) >= 66:
    val = int(result, 16)
    if val == 1:
        print("\n   ✓ VERIFICATION PASSED! Falcon-512 precompile works correctly.\n")
    else:
        print(f"\n   ✗ VERIFICATION FAILED (returned {val}, expected 1)\n")
else:
    print(f"\n   ✗ UNEXPECTED RESULT: {result}\n")

# 8. Now test with the message hash (32 bytes) as the contract would use
import hashlib
msg_hash = hashlib.sha3_256(b"test").digest()  # simulating keccak256
precompile_input2 = s2_flat + ntth_flat + nonce + msg
# Actually the contract signs keccak256(abi.encodePacked(...)) which is 32 bytes
# But the precompile verifies the RAW message that was signed
# So the contract must pass the SAME bytes that were signed, not the hash
print(f"8. Note: precompile verifies the ORIGINAL message, not a hash of it.")
print(f"   The frontend must sign the exact msgHash bytes, and the contract must")
print(f"   pass those same bytes to the precompile as the message portion.")
