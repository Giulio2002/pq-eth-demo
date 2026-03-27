// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQWalletBase.sol";

/// @notice Quantum-resistant wallet using ephemeral ECDSA key rotation.
///         Based on: ethresear.ch/t/achieving-quantum-safety-through-ephemeral-key-pairs-and-account-abstraction
///
///         Each ECDSA key pair is single-use. Every transaction includes the next signer address
///         in the signature payload. After verification the wallet rotates to the new signer,
///         making the exposed public key immediately useless. No post-quantum primitives required —
///         quantum safety comes from limiting public key exposure to a single transaction.
///
///         Signature layout: ecdsaSig(65 bytes: r‖s‖v) ‖ nextSigner(20 bytes) = 85 bytes
///         Message hash:     keccak256(to, value, data, nonce, chainId, nextSigner)
///         The nextSigner is bound into the signed message to prevent signer-substitution attacks.
contract EphemeralECDSAWallet is PQWalletBase {
    address public currentSigner;

    event SignerRotated(address indexed oldSigner, address indexed newSigner, uint256 nonce);

    function algorithm() external pure override returns (uint8) { return 4; }

    /// @notice Initialize with the first ephemeral signer address.
    ///         publicKey = abi.encodePacked(initialSignerAddress) — 20 bytes
    ///         verifyKey = "" (unused for ECDSA)
    function initialize(bytes calldata _publicKey, bytes calldata _verifyKey, address _payer) external override {
        require(!initialized, "Already initialized");
        _validateKeys(_publicKey, _verifyKey);
        publicKey = _publicKey;
        currentSigner = address(bytes20(_publicKey));
        payer = _payer;
        initialized = true;
        emit Initialized(_publicKey, _payer);
    }

    function _validateKeys(bytes calldata pk, bytes calldata) internal pure override {
        require(pk.length == 20, "Ephemeral pk must be 20-byte address");
    }

    /// @notice Execute a call and rotate the signer atomically.
    function execute(
        address to, uint256 value, bytes calldata data, bytes calldata signature
    ) external override {
        require(initialized, "Not initialized");
        require(msg.sender == payer, "Only payer");
        require(signature.length == 85, "Sig must be 85 bytes");

        address nextSigner = address(bytes20(signature[65:85]));
        require(nextSigner != address(0), "Zero next signer");

        bytes32 msgHash = keccak256(abi.encodePacked(to, value, data, nonce, block.chainid, nextSigner));
        address recovered = _ecRecover(msgHash, signature[:65]);
        require(recovered == currentSigner, "Invalid ephemeral sig");

        address oldSigner = currentSigner;
        currentSigner = nextSigner;
        nonce++;

        emit SignerRotated(oldSigner, nextSigner, nonce - 1);
        emit Executed(to, value, nonce - 1);

        (bool ok,) = to.call{value: value}(data);
        require(ok, "Execution failed");
    }

    /// @notice Execute a batch of calls and rotate the signer atomically.
    function executeBatch(
        address[] calldata targets, uint256[] calldata values,
        bytes[] calldata datas, bytes calldata signature
    ) external override {
        require(initialized, "Not initialized");
        require(msg.sender == payer, "Only payer");
        require(targets.length == values.length && values.length == datas.length, "Length mismatch");
        require(signature.length == 85, "Sig must be 85 bytes");

        address nextSigner = address(bytes20(signature[65:85]));
        require(nextSigner != address(0), "Zero next signer");

        bytes32 msgHash = keccak256(abi.encode(targets, values, datas, nonce, block.chainid, nextSigner));
        address recovered = _ecRecover(msgHash, signature[:65]);
        require(recovered == currentSigner, "Invalid ephemeral sig");

        address oldSigner = currentSigner;
        currentSigner = nextSigner;
        nonce++;

        emit SignerRotated(oldSigner, nextSigner, nonce - 1);

        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok,) = targets[i].call{value: values[i]}(datas[i]);
            require(ok, "Batch call failed");
        }
    }

    /// @dev Recover ECDSA signer from r‖s‖v signature over a hash.
    function _ecRecover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        bytes32 r = bytes32(sig[:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        return ecrecover(hash, v, r, s);
    }

    /// @dev Not used — execute/executeBatch handle verification inline because
    ///      the message hash includes nextSigner and the signer must rotate.
    function _verify(bytes32, bytes calldata) internal pure override returns (bool) {
        revert("Use execute directly");
    }
}
