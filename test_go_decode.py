#!/usr/bin/env python3
"""Compare Python decode with Go decode to find the bug."""

import json, subprocess, struct, sys, os

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

def eth_call(to, data_hex):
    return rpc_call("eth_call", [{"to": to, "data": data_hex, "gas": "0xFFFFFF"}, "latest"])

def coeffs_to_flat(coeffs):
    return b"".join(c.to_bytes(2, "big") for c in coeffs)

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

def decode_pk_py(pk_bytes):
    data = pk_bytes[1:]
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

def decode_sig_py(sig_bytes):
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

# Generate a keypair and signature, save to files for Go to read
from pqcrypto.sign.falcon_512 import generate_keypair, sign
pk, sk = generate_keypair()
pk_bytes = bytes(pk)
sk_bytes = bytes(sk)
msg = b"hello world test 123"
sig_bytes = bytes(sign(sk, msg))

# Save raw bytes
with open("/tmp/test_pk.bin", "wb") as f: f.write(pk_bytes)
with open("/tmp/test_sig.bin", "wb") as f: f.write(sig_bytes)
with open("/tmp/test_msg.bin", "wb") as f: f.write(msg)

# Python decode
h = decode_pk_py(pk_bytes)
nonce, s2 = decode_sig_py(sig_bytes)

print(f"Python pk decode: first 10 h = {h[:10]}")
print(f"Python sig decode: first 10 s2 = {s2[:10]}")
print(f"Python nonce: {nonce.hex()[:40]}...")

# NTT forward
header = (N).to_bytes(32, "big") + (Q).to_bytes(32, "big") + (49).to_bytes(32, "big")
ntt_result = eth_call("0x0000000000000000000000000000000000000012", "0x" + (header + coeffs_to_flat(h)).hex())
ntth_bytes = bytes.fromhex(ntt_result[2:])
ntth = [int.from_bytes(ntth_bytes[i*2:i*2+2], "big") for i in range(N)]
print(f"Python NTT: first 10 ntth = {ntth[:10]}")

# Verify with precompile
s2_flat = coeffs_to_flat(s2)
ntth_flat = coeffs_to_flat(ntth)
precompile_input = s2_flat + ntth_flat + nonce + msg
result = eth_call("0x0000000000000000000000000000000000000017", "0x" + precompile_input.hex())
print(f"Python verify result: {result}")
assert int(result, 16) == 1, "Python pipeline should pass!"

# Now test: what if msg is a 32-byte keccak hash (as the contract does)?
# The frontend signs keccak256(abi.encodePacked(to, value, data, nonce, chainid))
# which is 32 bytes. The signature includes a 40-byte nonce and signs those 32 bytes.
import hashlib
msg32 = bytes.fromhex("abcdef1234567890" * 4)  # dummy 32 bytes
sig32 = bytes(sign(sk, msg32))
nonce32, s2_32 = decode_sig_py(sig32)
s2_flat32 = coeffs_to_flat(s2_32)
input32 = s2_flat32 + ntth_flat + nonce32 + msg32
result32 = eth_call("0x0000000000000000000000000000000000000017", "0x" + input32.hex())
print(f"\n32-byte message verify: {result32}")
assert int(result32, 16) == 1, "32-byte msg should also pass!"

print(f"\n✓ Both tests pass. The Python pipeline is correct.")
print(f"\nNow checking: does the Go backend's decode match?")
print(f"Writing test vectors to /tmp/test_vectors.json...")

json.dump({
    "pk_hex": pk_bytes.hex(),
    "sig_hex": sig_bytes.hex(),
    "msg_hex": msg.hex(),
    "h_first10": h[:10],
    "s2_first10": s2[:10],
    "nonce_hex": nonce.hex(),
    "ntth_first10": ntth[:10],
    "s2_flat_hex": s2_flat.hex()[:100] + "...",
    "ntth_flat_hex": ntth_flat.hex()[:100] + "...",
}, open("/tmp/test_vectors.json", "w"), indent=2)

print("Done. Compare these with Go output to find the mismatch.")
