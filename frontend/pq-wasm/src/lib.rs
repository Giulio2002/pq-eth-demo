use wasm_bindgen::prelude::*;

const FALCON_N: usize = 512;
const FALCON_Q: u16 = 12289;
const FALCON_NONCE_LEN: usize = 40;

// ── Falcon-512 ──

/// Returns publicKey(897) || secretKey(1281)
#[wasm_bindgen]
pub fn falcon_keygen() -> Vec<u8> {
    let sk = falcon_rust::falcon512::SecretKey::generate();
    let pk = falcon_rust::falcon512::PublicKey::from_secret_key(&sk);
    let mut result = pk.to_bytes().to_vec();
    result.extend_from_slice(&sk.to_bytes());
    result
}

/// Signs message and returns the PRECOMPILE-READY format:
///   s2_flat(1024 bytes, 512 × uint16 BE) || nonce(40 bytes)
/// This can be passed directly to the smart wallet's execute() function.
/// The contract will combine it with the stored ntth and call precompile 0x17.
#[wasm_bindgen]
pub fn falcon_sign(secret_key: &[u8], message: &[u8]) -> Vec<u8> {
    let sk = falcon_rust::falcon512::SecretKey::from_bytes(secret_key)
        .expect("invalid falcon secret key");
    let sig = falcon_rust::falcon512::sign(message, &sk);
    let sig_bytes = sig.to_bytes();

    // Decode the standard Falcon signature to precompile format
    decode_falcon_sig_for_precompile(&sig_bytes)
}

/// Also export the raw standard signature for debugging
#[wasm_bindgen]
pub fn falcon_sign_raw(secret_key: &[u8], message: &[u8]) -> Vec<u8> {
    let sk = falcon_rust::falcon512::SecretKey::from_bytes(secret_key)
        .expect("invalid falcon secret key");
    let sig = falcon_rust::falcon512::sign(message, &sk);
    sig.to_bytes()
}

/// Decode a standard Falcon-512 pk (897 bytes) to h coefficients (1024 bytes, uint16 BE).
/// Returns the raw h coefficients — NOT NTT domain. The backend must call NTT_FW precompile
/// on these to get ntth for the verifyKey.
#[wasm_bindgen]
pub fn falcon_decode_pk(pk_bytes: &[u8]) -> Vec<u8> {
    assert!(pk_bytes.len() == 897, "falcon pk must be 897 bytes");
    let data = &pk_bytes[1..]; // skip header byte

    let mut result = vec![0u8; FALCON_N * 2];
    let mut bit_pos = 0usize;

    for i in 0..FALCON_N {
        let mut val: u16 = 0;
        for _ in 0..14 {
            let byte_idx = bit_pos / 8;
            let bit_idx = 7 - (bit_pos % 8);
            val = (val << 1) | (((data[byte_idx] >> bit_idx) & 1) as u16);
            bit_pos += 1;
        }
        result[i * 2] = (val >> 8) as u8;
        result[i * 2 + 1] = (val & 0xff) as u8;
    }

    result
}

/// Decode a standard Falcon-512 signature into precompile format:
///   s2_flat(1024 bytes) || nonce(40 bytes) = 1064 bytes
fn decode_falcon_sig_for_precompile(sig_bytes: &[u8]) -> Vec<u8> {
    assert!(sig_bytes.len() >= 42, "falcon sig too short");

    // Extract nonce (bytes 1..41)
    let nonce = &sig_bytes[1..1 + FALCON_NONCE_LEN];

    // Decode compressed s2 coefficients (bytes 41+)
    let comp = &sig_bytes[1 + FALCON_NONCE_LEN..];
    let s2 = decode_falcon_compressed(comp);

    // Pack: s2_flat(1024) || nonce(40)
    let mut result = Vec::with_capacity(FALCON_N * 2 + FALCON_NONCE_LEN);
    for coeff in &s2 {
        result.push((*coeff >> 8) as u8);
        result.push((*coeff & 0xff) as u8);
    }
    result.extend_from_slice(nonce);

    result
}

fn decode_falcon_compressed(data: &[u8]) -> Vec<u16> {
    let mut coeffs = vec![0u16; FALCON_N];
    let mut bit_pos = 0usize;

    for i in 0..FALCON_N {
        // Sign bit
        let sign_bit = read_bit(data, bit_pos);
        bit_pos += 1;

        // 7 low bits
        let mut low: u32 = 0;
        for _ in 0..7 {
            low = (low << 1) | (read_bit(data, bit_pos) as u32);
            bit_pos += 1;
        }

        // Unary-coded high bits
        let mut high: u32 = 0;
        loop {
            let bit = read_bit(data, bit_pos);
            bit_pos += 1;
            if bit == 1 {
                break;
            }
            high += 1;
        }

        let magnitude = (high << 7) | low;
        coeffs[i] = if sign_bit == 1 {
            ((FALCON_Q as u32 - magnitude) % FALCON_Q as u32) as u16
        } else {
            (magnitude % FALCON_Q as u32) as u16
        };
    }

    coeffs
}

fn read_bit(data: &[u8], bit_offset: usize) -> u8 {
    let byte_idx = bit_offset / 8;
    let bit_idx = 7 - (bit_offset % 8);
    if byte_idx >= data.len() {
        return 0;
    }
    (data[byte_idx] >> bit_idx) & 1
}

// ── ML-DSA-44 (Dilithium2) ──

/// Returns publicKey(1312) || secretKey(2560)
#[wasm_bindgen]
pub fn dilithium_keygen() -> Vec<u8> {
    let keys = pqc_dilithium::Keypair::generate();
    let mut result = keys.public.to_vec();
    result.extend_from_slice(keys.expose_secret());
    result
}

/// Returns detached signature (2420 bytes)
/// Prepends FIPS 204 empty context wrapper (0x00 || 0x00) to message before signing,
/// matching what the EVM precompile expects.
#[wasm_bindgen]
pub fn dilithium_sign(secret_key: &[u8], message: &[u8]) -> Vec<u8> {
    // Check sk size — old wallets may have 2528-byte keys (pre-FIPS 204 tr fix)
    if secret_key.len() != pqc_dilithium::SECRETKEYBYTES {
        // Return empty vec to signal error instead of panicking
        return vec![];
    }

    // FIPS 204: M' = 0x00 || 0x00 || M (empty context)
    let mut wrapped = Vec::with_capacity(2 + message.len());
    wrapped.push(0x00);
    wrapped.push(0x00);
    wrapped.extend_from_slice(message);

    let mut sig = vec![0u8; pqc_dilithium::SIGNBYTES];
    pqc_dilithium::crypto_sign_signature(&mut sig, &wrapped, secret_key);
    sig
}
