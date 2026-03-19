// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Store bytes as contract bytecode, read with EXTCODECOPY.
library SSTORE2 {
    function write(bytes memory data) internal returns (address pointer) {
        bytes memory initCode = abi.encodePacked(
            hex"61", uint16(data.length + 1),
            hex"80600c6000396000f300",
            data
        );
        assembly { pointer := create(0, add(initCode, 0x20), mload(initCode)) }
        require(pointer != address(0), "SSTORE2: deploy failed");
    }

    function read(address pointer) internal view returns (bytes memory data) {
        assembly {
            let size := sub(extcodesize(pointer), 1)
            data := mload(0x40)
            mstore(data, size)
            extcodecopy(pointer, add(data, 0x20), 1, size)
            mstore(0x40, add(add(data, 0x20), size))
        }
    }
}
