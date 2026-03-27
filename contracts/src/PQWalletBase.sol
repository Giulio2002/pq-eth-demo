// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SSTORE2.sol";

/// @notice Abstract base for PQ smart wallets. Each algorithm has its own implementation
///         with _verify written in Yul for maximum gas efficiency.
abstract contract PQWalletBase {
    bytes public publicKey;
    address public verifyKeyPointer;  // SSTORE2: verifyKey as bytecode
    address public payer;
    bool public initialized;
    uint256 public nonce;

    event Executed(address indexed to, uint256 value, uint256 nonce);
    event Initialized(bytes publicKey, address payer);

    /// @notice Algorithm ID (0=Falcon Direct, 1=Dilithium Direct, 2=Falcon NTT, 3=Dilithium NTT)
    function algorithm() external pure virtual returns (uint8);

    function initialize(bytes calldata _publicKey, bytes calldata _verifyKey, address _payer) external virtual {
        require(!initialized, "Already initialized");
        _validateKeys(_publicKey, _verifyKey);
        publicKey = _publicKey;
        verifyKeyPointer = SSTORE2.write(_verifyKey);
        payer = _payer;
        initialized = true;
        emit Initialized(_publicKey, _payer);
    }

    function _validateKeys(bytes calldata _publicKey, bytes calldata _verifyKey) internal pure virtual;

    function execute(
        address to, uint256 value, bytes calldata data, bytes calldata signature
    ) external virtual {
        require(initialized, "Not initialized");
        require(msg.sender == payer, "Only payer");

        bytes32 msgHash = keccak256(abi.encodePacked(to, value, data, nonce, block.chainid));
        require(_verify(msgHash, signature), "Invalid PQ signature");

        nonce++;
        emit Executed(to, value, nonce - 1);

        (bool ok,) = to.call{value: value}(data);
        require(ok, "Execution failed");
    }

    function executeBatch(
        address[] calldata targets, uint256[] calldata values,
        bytes[] calldata datas, bytes calldata signature
    ) external virtual {
        require(initialized, "Not initialized");
        require(msg.sender == payer, "Only payer");
        require(targets.length == values.length && values.length == datas.length, "Length mismatch");

        bytes32 msgHash = keccak256(abi.encode(targets, values, datas, nonce, block.chainid));
        require(_verify(msgHash, signature), "Invalid PQ signature");

        nonce++;
        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok,) = targets[i].call{value: values[i]}(datas[i]);
            require(ok, "Batch call failed");
        }
    }

    /// @dev Override with Yul implementation per algorithm. Takes msgHash (32 bytes) directly.
    function _verify(bytes32 msgHash, bytes calldata signature) internal view virtual returns (bool);

    receive() external payable {}
}
