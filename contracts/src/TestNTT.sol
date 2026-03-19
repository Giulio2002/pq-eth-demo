// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TestNTT {
    // Test each precompile step individually
    function step1_shake(bytes calldata salt_msg) external view returns (bool ok, uint256 retsize) {
        assembly {
            mstore(0x2000, 256)       // security
            mstore(0x2020, 1024)      // output_len
            calldatacopy(0x2040, salt_msg.offset, salt_msg.length)
            let success := staticcall(gas(), 0x16, 0x2000, add(64, salt_msg.length), 0x3000, 0x400)
            ok := success
            retsize := returndatasize()
        }
    }

    function step1b_shake_no_sec(bytes calldata salt_msg) external view returns (bool ok, uint256 retsize) {
        assembly {
            mstore(0x2000, 1024)      // output_len only
            calldatacopy(0x2020, salt_msg.offset, salt_msg.length)
            let success := staticcall(gas(), 0x16, 0x2000, add(32, salt_msg.length), 0x3000, 0x400)
            ok := success
            retsize := returndatasize()
        }
    }

    function step2_nttfw(bytes calldata s2) external view returns (bool ok, uint256 retsize) {
        assembly {
            mstore(0x2000, 512)
            mstore(0x2020, 12289)
            mstore(0x2040, 49)
            calldatacopy(0x2060, s2.offset, 1024)
            let success := staticcall(gas(), 0x12, 0x2000, 0x460, 0x3400, 0x400)
            ok := success
            retsize := returndatasize()
        }
    }

    function step3_vecmul(bytes calldata a, bytes calldata b) external view returns (bool ok, uint256 retsize) {
        assembly {
            mstore(0x2000, 512)
            mstore(0x2020, 12289)
            calldatacopy(0x2040, a.offset, 1024)
            calldatacopy(0x2440, b.offset, 1024)
            let success := staticcall(gas(), 0x14, 0x2000, 0x840, 0x2000, 0x400)
            ok := success
            retsize := returndatasize()
        }
    }
}
