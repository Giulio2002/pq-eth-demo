// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQWalletBase.sol";

/// @notice PQ wallet using ML-DSA-44 (Dilithium) direct verification via precompile 0x1b.
///         _verify is pure Yul: builds pk(1312)||sig(2420)||msg(32) and staticcalls 0x1b.
contract DilithiumDirectWallet is PQWalletBase {
    function algorithm() external pure override returns (uint8) { return 1; }

    function _validateKeys(bytes calldata pk, bytes calldata vk) internal pure override {
        require(pk.length == 1312, "Dilithium pk must be 1312 bytes");
        require(vk.length == 1312, "Dilithium verifyKey must be 1312 bytes");
    }

    /// @dev Dilithium Direct verify in Yul.
    ///      signature layout: standard ML-DSA-44 signature (2420 bytes)
    ///      Precompile 0x1b input: pk(1312) || sig(2420) || msgHash(32) = 3764 bytes
    function _verify(bytes32 msgHash, bytes calldata signature) internal view override returns (bool valid) {
        address vkPtr = verifyKeyPointer;
        assembly {
            // Validate signature length
            if iszero(eq(signature.length, 2420)) {
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x20)
                mstore(0x24, 18)
                mstore(0x44, "bad dilithium sig\x00")
                revert(0x00, 0x64)
            }

            // Allocate 3764 bytes for precompile input
            let input := mload(0x40)

            // 1. Copy pk (1312 bytes from SSTORE2 pointer, skip 1-byte STOP prefix)
            extcodecopy(vkPtr, input, 1, 1312)

            // 2. Copy signature (2420 bytes from calldata)
            calldatacopy(add(input, 1312), signature.offset, 2420)

            // 3. FIPS 204 context wrapper: 0x00 || 0x00 || msgHash
            // The precompile expects the message with empty FIPS 204 context prefix
            mstore8(add(input, 3732), 0x00)
            mstore8(add(input, 3733), 0x00)
            mstore(add(input, 3734), msgHash)

            // staticcall precompile 0x1b: pk(1312) + sig(2420) + 0x0000(2) + msgHash(32) = 3766
            let ok := staticcall(gas(), 0x1b, input, 3766, 0x00, 0x20)

            valid := and(ok, eq(mload(0x00), 1))
        }
    }
}
