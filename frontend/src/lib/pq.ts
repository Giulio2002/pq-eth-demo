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
  if (!wasmExports) throw new Error("PQ WASM not initialized. Call initPQ() first.");

  const isFalcon = algorithm.startsWith("falcon");
  const raw = isFalcon ? wasmExports.falcon_keygen() : wasmExports.dilithium_keygen();

  const pkSize = isFalcon ? 897 : 1312;
  return {
    publicKey: new Uint8Array(raw.slice(0, pkSize)),
    secretKey: new Uint8Array(raw.slice(pkSize)),
  };
}

export function sign(
  algorithm: AlgorithmType,
  secretKey: Uint8Array,
  message: Uint8Array
): Uint8Array {
  if (!wasmExports) throw new Error("PQ WASM not initialized. Call initPQ() first.");

  return algorithm.startsWith("falcon")
    ? wasmExports.falcon_sign(secretKey, message)
    : wasmExports.dilithium_sign(secretKey, message);
}
