// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQWalletBase.sol";

/// @notice PQ wallet using Falcon-512 direct verification via precompile 0x17.
///         _verify is pure Yul: builds s2(1024)||ntth(1024)||nonce(40)||msg(32) and staticcalls 0x17.
contract FalconDirectWallet is PQWalletBase {
    function algorithm() external pure override returns (uint8) { return 0; }

    function _validateKeys(bytes calldata pk, bytes calldata vk) internal pure override {
        require(pk.length == 897, "Falcon pk must be 897 bytes");
        require(vk.length == 1024, "Falcon verifyKey must be 1024 bytes");
    }

    /// @dev Falcon Direct verify in Yul.
    ///      signature layout: s2_flat(1024 bytes) || nonce(40 bytes) = 1064 bytes total
    ///      Precompile 0x17 input: s2(1024) || ntth(1024) || nonce(40) || msgHash(32) = 2120 bytes
    function _verify(bytes32 msgHash, bytes calldata signature) internal view override returns (bool valid) {
        address vkPtr = verifyKeyPointer;
        assembly {
            // Validate signature length
            if iszero(eq(signature.length, 1064)) {
                mstore(0x00, 0x08c379a000000000000000000000000000000000000000000000000000000000)
                mstore(0x04, 0x20)
                mstore(0x24, 14)
                mstore(0x44, "bad falcon sig")
                revert(0x00, 0x64)
            }

            // Allocate 2120 bytes for precompile input at free memory pointer
            let input := mload(0x40)

            // 1. Copy s2 (1024 bytes from calldata signature)
            calldatacopy(input, signature.offset, 1024)

            // 2. Copy ntth (1024 bytes from SSTORE2 pointer via EXTCODECOPY, skip 1-byte STOP prefix)
            extcodecopy(vkPtr, add(input, 1024), 1, 1024)

            // 3. Copy nonce (40 bytes from calldata signature offset 1024)
            calldatacopy(add(input, 2048), add(signature.offset, 1024), 40)

            // 4. Store msgHash (32 bytes)
            mstore(add(input, 2088), msgHash)

            // staticcall precompile 0x17
            let ok := staticcall(gas(), 0x17, input, 2120, 0x00, 0x20)

            valid := and(ok, eq(mload(0x00), 1))
        }
    }
}
