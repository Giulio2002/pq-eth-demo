import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { AlgorithmType } from "./utils";

interface PQWasmExports {
  falcon_keygen: () => Uint8Array;
  falcon_sign: (secretKey: Uint8Array, message: Uint8Array) => Uint8Array;
  dilithium_keygen: () => Uint8Array;
  dilithium_sign: (secretKey: Uint8Array, message: Uint8Array) => Uint8Array;
}

let wasmExports: PQWasmExports | null = null;
let initPromise: Promise<void> | null = null;

export async function initPQ(): Promise<void> {
  if (wasmExports) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Fetch and instantiate WASM directly, bypassing webpack bundling entirely.
    // Both pq_wasm.js and pq_wasm_bg.wasm must be in the public/ directory.
    const wasmResponse = await fetch("/pq_wasm_bg.wasm");
    const wasmBytes = await wasmResponse.arrayBuffer();
    const wasmModule = await WebAssembly.compile(wasmBytes);

    // Import the JS glue code from public/ using webpackIgnore to prevent bundling
    // @ts-ignore - dynamic import from public dir bypasses webpack
    const mod = await import(/* webpackIgnore: true */ "/pq_wasm.js");
    await mod.default(wasmModule);
    wasmExports = mod as unknown as PQWasmExports;
  })();

  return initPromise;
}

export function isPQReady(): boolean {
  return wasmExports !== null;
}

export function generateKeypair(algorithm: AlgorithmType): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  if (algorithm === "ephemeral-ecdsa") {
    return generateECDSAKeypair();
  }

  if (!wasmExports) throw new Error("PQ WASM not initialized. Call initPQ() first.");

  const isFalcon = algorithm.startsWith("falcon");
  const raw = isFalcon ? wasmExports.falcon_keygen() : wasmExports.dilithium_keygen();

  const pkSize = isFalcon ? 897 : 1312;
  return {
    publicKey: new Uint8Array(raw.slice(0, pkSize)),
    secretKey: new Uint8Array(raw.slice(pkSize)),
  };
}

// --- Ephemeral ECDSA ---

export const EPHEMERAL_KEY_COUNT = 8192;

/** Generate a random 32-byte seed for ephemeral ECDSA key derivation. */
export function generateEphemeralSeed(): Uint8Array {
  return secp256k1.utils.randomSecretKey(); // 32 random bytes
}

/** Derive private key at index i from a seed: keccak256(seed || uint32BE(i)) */
export function deriveEphemeralKey(seed: Uint8Array, index: number): Uint8Array {
  const buf = new Uint8Array(36); // 32 bytes seed + 4 bytes index
  buf.set(seed, 0);
  buf[32] = (index >> 24) & 0xff;
  buf[33] = (index >> 16) & 0xff;
  buf[34] = (index >> 8) & 0xff;
  buf[35] = index & 0xff;
  return keccak_256(buf);
}

/** Derive address at index i from a seed. */
export function deriveEphemeralAddress(seed: Uint8Array, index: number): Uint8Array {
  return ecdsaPrivKeyToAddress(deriveEphemeralKey(seed, index));
}

/** Generate initial ephemeral ECDSA keypair (seed-based). publicKey = address of key[0]. */
export function generateECDSAKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array; // this is the SEED, not a single private key
} {
  const seed = generateEphemeralSeed();
  const address = deriveEphemeralAddress(seed, 0);
  return { publicKey: address, secretKey: seed };
}

/** Derive 20-byte Ethereum address from a 32-byte private key. */
export function ecdsaPrivKeyToAddress(privKey: Uint8Array): Uint8Array {
  const uncompressedPub = secp256k1.getPublicKey(privKey, false);
  // keccak256 of the 64-byte public key (skip the 0x04 prefix)
  const hash = keccak_256(uncompressedPub.slice(1));
  return hash.slice(-20);
}

/**
 * Sign a 32-byte message hash with ECDSA and append nextSigner address.
 * Returns: r(32) || s(32) || v(1) || nextSigner(20) = 85 bytes
 */
export function ecdsaSignWithRotation(
  privKey: Uint8Array,
  msgHash: Uint8Array,
  nextSignerAddress: Uint8Array
): Uint8Array {
  // sign() with prehash:false since msgHash is already hashed (keccak256)
  const compact = secp256k1.sign(msgHash, privKey, { prehash: false });
  const expectedPub = secp256k1.getPublicKey(privKey, false);

  // Determine recovery bit by trial (0 or 1)
  let recovery = 0;
  const sigObj = secp256k1.Signature.fromHex(
    Array.from(compact, (b) => b.toString(16).padStart(2, "0")).join("")
  );
  for (const bit of [0, 1] as const) {
    try {
      const recovered = sigObj.addRecoveryBit(bit).recoverPublicKey(msgHash);
      const recoveredBytes = recovered.toBytes(false);
      if (recoveredBytes.length === expectedPub.length &&
          recoveredBytes.every((b: number, i: number) => b === expectedPub[i])) {
        recovery = bit;
        break;
      }
    } catch {
      // try next bit
    }
  }

  const result = new Uint8Array(85);
  result.set(compact, 0);
  result[64] = recovery + 27; // v = recovery + 27
  result.set(nextSignerAddress, 65);
  return result;
}

export function sign(
  algorithm: AlgorithmType,
  secretKey: Uint8Array,
  message: Uint8Array
): Uint8Array {
  if (algorithm === "ephemeral-ecdsa") {
    throw new Error("Use ecdsaSignWithRotation() for ephemeral ECDSA");
  }
  if (!wasmExports) throw new Error("PQ WASM not initialized. Call initPQ() first.");

  return algorithm.startsWith("falcon")
    ? wasmExports.falcon_sign(secretKey, message)
    : wasmExports.dilithium_sign(secretKey, message);
}
