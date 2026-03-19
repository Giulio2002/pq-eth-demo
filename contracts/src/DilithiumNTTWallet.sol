// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQWalletBase.sol";

/// @notice PQ wallet using Dilithium-2 NTT (Lego) verification.
///         Uses the full Dilithium verification pipeline via precompile 0x1b.
///         The precompile internally decomposes verification into NTT operations
///         (ExpandA, NTT, VECMULMOD, VECADDMOD, NTT_INV, UseHint, SHAKE).
contract DilithiumNTTWallet is PQWalletBase {
    function algorithm() external pure override returns (uint8) { return 3; }

    function _validateKeys(bytes calldata pk, bytes calldata vk) internal pure override {
        require(pk.length == 1312, "Dilithium pk must be 1312 bytes");
        require(vk.length == 1312, "Dilithium verifyKey must be 1312 bytes");
    }

    /// @dev Dilithium-2 verification via precompile 0x1b with FIPS 204 context prefix.
    function _verify(bytes32 msgHash, bytes calldata signature) internal view override returns (bool valid) {
        address vkPtr = verifyKeyPointer;
        assembly {
            if iszero(eq(signature.length, 2420)) {
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x20)
                mstore(0x24, 18)
                mstore(0x44, "bad dilithium sig\x00")
                revert(0x00, 0x64)
            }

            let input := mload(0x40)

            // pk (1312 bytes from SSTORE2)
            extcodecopy(vkPtr, input, 1, 1312)

            // sig (2420 bytes from calldata)
            calldatacopy(add(input, 1312), signature.offset, 2420)

            // FIPS 204 context: 0x00 || 0x00 || msgHash
            mstore8(add(input, 3732), 0x00)
            mstore8(add(input, 3733), 0x00)
            mstore(add(input, 3734), msgHash)

            // staticcall precompile 0x1b: pk(1312) + sig(2420) + ctx(2) + msgHash(32) = 3766
            let ok := staticcall(gas(), 0x1b, input, 3766, 0x00, 0x20)

            valid := and(ok, eq(mload(0x00), 1))
        }
    }
}
