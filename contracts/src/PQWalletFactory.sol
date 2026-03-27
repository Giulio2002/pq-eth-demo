// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PQWalletBase.sol";
import "./FalconDirectWallet.sol";
import "./DilithiumDirectWallet.sol";
import "./FalconNTTWallet.sol";
import "./DilithiumNTTWallet.sol";
import "./EphemeralECDSAWallet.sol";

contract PQWalletFactory {
    event WalletCreated(address indexed wallet, address indexed owner, uint8 algorithm);

    function createWallet(
        bytes calldata publicKey,
        bytes calldata verifyKey,
        uint8 algo,
        address payer
    ) external returns (address wallet) {
        PQWalletBase w;
        if (algo == 0) {
            w = new FalconDirectWallet();
        } else if (algo == 1) {
            w = new DilithiumDirectWallet();
        } else if (algo == 2) {
            w = new FalconNTTWallet();
        } else if (algo == 3) {
            w = new DilithiumNTTWallet();
        } else if (algo == 4) {
            w = new EphemeralECDSAWallet();
        } else {
            revert("Invalid algorithm");
        }
        w.initialize(publicKey, verifyKey, payer);
        wallet = address(w);
        emit WalletCreated(wallet, msg.sender, algo);
    }
}
