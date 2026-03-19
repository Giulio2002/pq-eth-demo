// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PQWalletFactory.sol";
import "../src/PQWalletBase.sol";

contract PQWalletFactoryTest is Test {
    event WalletCreated(address indexed wallet, address indexed owner, uint8 algorithm);

    PQWalletFactory factory;
    address payer = address(0xBEEF);

    bytes falconPk;
    bytes falconVk;
    bytes dilithiumPk;

    function setUp() public {
        factory = new PQWalletFactory();
        falconPk = new bytes(897);
        falconVk = new bytes(1024);
        dilithiumPk = new bytes(1312);
        for (uint i = 0; i < 897; i++) falconPk[i] = bytes1(uint8(i % 256));
        for (uint i = 0; i < 1024; i++) falconVk[i] = bytes1(uint8(i % 256));
        for (uint i = 0; i < 1312; i++) dilithiumPk[i] = bytes1(uint8(i % 256));
    }

    function test_createFalconDirect() public {
        address w = factory.createWallet(falconPk, falconVk, 0, payer);
        assertTrue(w != address(0));
        assertEq(PQWalletBase(payable(w)).algorithm(), 0);
        assertTrue(PQWalletBase(payable(w)).initialized());
    }

    function test_createDilithiumDirect() public {
        address w = factory.createWallet(dilithiumPk, dilithiumPk, 1, payer);
        assertEq(PQWalletBase(payable(w)).algorithm(), 1);
    }

    function test_createFalconNTT() public {
        address w = factory.createWallet(falconPk, falconVk, 2, payer);
        assertEq(PQWalletBase(payable(w)).algorithm(), 2);
    }

    function test_createDilithiumNTT() public {
        address w = factory.createWallet(dilithiumPk, dilithiumPk, 3, payer);
        assertEq(PQWalletBase(payable(w)).algorithm(), 3);
    }

    function test_multipleWallets() public {
        address w1 = factory.createWallet(falconPk, falconVk, 0, payer);
        address w2 = factory.createWallet(falconPk, falconVk, 0, payer);
        address w3 = factory.createWallet(dilithiumPk, dilithiumPk, 1, payer);
        assertTrue(w1 != w2 && w2 != w3);
    }
}
