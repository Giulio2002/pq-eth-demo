// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQWalletBase.sol";

/// @notice Falcon-512 NTT (Lego) wallet — full inline NTT verification using building-block precompiles:
///         SHAKE(0x16) → NTT_FW(0x12) → VECMULMOD(0x14) → NTT_INV(0x13) → VECSUBMOD(0x19) → LP_NORM(0x18)
///         Adapted from FalconVerifierNTTBound.yul (pq-eth-precompiles).
contract FalconNTTWallet is PQWalletBase {
    function algorithm() external pure override returns (uint8) { return 2; }

    function _validateKeys(bytes calldata pk, bytes calldata vk) internal pure override {
        require(pk.length == 897, "Falcon pk must be 897 bytes");
        require(vk.length == 1024, "Falcon verifyKey must be 1024 bytes");
    }

    /// @dev Full NTT pipeline. Memory layout uses high addresses to avoid Solidity conflicts:
    ///   0x2000: scratch for precompile I/O (input buffer)
    ///   0x3000: hashed (1024 bytes, from SHAKE)
    ///   0x3400: ntt_s2 (1024 bytes, from NTT_FW)
    ///   0x3800: s1 (1024 bytes, from NTT_INV)
    ///   0x3C00: diff (1024 bytes, from VECSUBMOD)
    function _verify(bytes32 msgHash, bytes calldata signature) internal view override returns (bool valid) {
        address vkPtr = verifyKeyPointer;
        assembly {
            if iszero(eq(signature.length, 1064)) { revert(0, 0) }

            // ── Step 1: SHAKE256_HTP (hash-to-point) via precompile 0x1c ──
            // Single call: SHAKE256 + rejection sampling mod Q=12289
            // Input: output_len(32) | data(nonce+msgHash)
            // Output: 1024 bytes (512 × uint16 BE coefficients mod Q)
            mstore(0x2000, 1024)
            calldatacopy(0x2020, add(signature.offset, 1024), 40)
            mstore(0x2048, msgHash)
            if iszero(staticcall(gas(), 0x1c, 0x2000, 104, 0x3000, 0x400)) { revert(0,0) }
            // hashed at 0x3000..0x33FF

            // ── Step 2: NTT_FW(s2) → 1024 bytes at 0x3400 ──
            // Input: n(32) | q(32) | psi(32) | s2(1024)
            mstore(0x2000, 512)
            mstore(0x2020, 12289)
            mstore(0x2040, 49)
            calldatacopy(0x2060, signature.offset, 0x400)  // s2
            // input size: 96 + 1024 = 1120 = 0x460
            if iszero(staticcall(gas(), 0x12, 0x2000, 0x460, 0x3400, 0x400)) { revert(0,0) }

            // ── Step 3: VECMULMOD(ntt_s2, ntth) → product at 0x2000 ──
            // Input: n(32) | q(32) | a(1024) | b(1024)
            mstore(0x2000, 512)
            mstore(0x2020, 12289)
            // Copy ntt_s2 from 0x3400 to 0x2040
            for { let i := 0 } lt(i, 0x400) { i := add(i, 32) } {
                mstore(add(0x2040, i), mload(add(0x3400, i)))
            }
            // Copy ntth from SSTORE2 to 0x2440
            extcodecopy(vkPtr, 0x2440, 1, 0x400)
            // input size: 64 + 2048 = 2112 = 0x840
            if iszero(staticcall(gas(), 0x14, 0x2000, 0x840, 0x2000, 0x400)) { revert(0,0) }
            // product at 0x2000..0x23FF

            // ── Step 4: NTT_INV(product) → s1 at 0x3800 ──
            // Input: n(32) | q(32) | psi(32) | product(1024)
            // Save product first, then build input
            for { let i := 0 } lt(i, 0x400) { i := add(i, 32) } {
                mstore(add(0x3800, i), mload(add(0x2000, i)))  // temp save product at 0x3800
            }
            mstore(0x2000, 512)
            mstore(0x2020, 12289)
            mstore(0x2040, 49)
            for { let i := 0 } lt(i, 0x400) { i := add(i, 32) } {
                mstore(add(0x2060, i), mload(add(0x3800, i)))  // product as input
            }
            if iszero(staticcall(gas(), 0x13, 0x2000, 0x460, 0x3800, 0x400)) { revert(0,0) }
            // s1 at 0x3800..0x3BFF

            // ── Step 5: VECSUBMOD(hashed - s1) → diff at 0x3C00 ──
            // Input: n(32) | q(32) | a(1024) | b(1024)
            mstore(0x2000, 512)
            mstore(0x2020, 12289)
            // a = hashed from 0x3000
            for { let i := 0 } lt(i, 0x400) { i := add(i, 32) } {
                mstore(add(0x2040, i), mload(add(0x3000, i)))
            }
            // b = s1 from 0x3800
            for { let i := 0 } lt(i, 0x400) { i := add(i, 32) } {
                mstore(add(0x2440, i), mload(add(0x3800, i)))
            }
            if iszero(staticcall(gas(), 0x19, 0x2000, 0x840, 0x3C00, 0x400)) { revert(0,0) }
            // diff at 0x3C00..0x3FFF

            // ── Step 6: LP_NORM(L2) on [diff, s2] ──
            // Input: q(32)|n(32)|bound(32)|cb(32)|p(32)|count(32)|diff(1024)|s2(1024)
            mstore(0x2000, 12289)       // q
            mstore(0x2020, 512)         // n
            mstore(0x2040, 34034726)    // bound (SIG_BOUND squared for L2)
            mstore(0x2060, 2)           // cb = 2 bytes per coeff
            mstore(0x2080, 2)           // p = 2 (L2 norm)
            mstore(0x20a0, 2)           // count = 2 vectors
            // vector 1: diff from 0x3C00
            for { let i := 0 } lt(i, 0x400) { i := add(i, 32) } {
                mstore(add(0x20c0, i), mload(add(0x3C00, i)))
            }
            // vector 2: s2 from calldata
            calldatacopy(0x24c0, signature.offset, 0x400)
            // input size: 192 + 2048 = 2240 = 0x8C0
            if iszero(staticcall(gas(), 0x18, 0x2000, 0x8C0, 0x2000, 0x20)) { revert(0,0) }

            valid := eq(mload(0x2000), 1)
        }
    }
}
