// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FalconDirectWallet.sol";
import "../src/DilithiumDirectWallet.sol";
import "../src/FalconNTTWallet.sol";
import "../src/DilithiumNTTWallet.sol";

contract Receiver {
    uint256 public received;
    function receiveETH() external payable { received += msg.value; }
    receive() external payable {}
}

contract PQWalletTest is Test {
    address payer = address(0xBEEF);
    address nttVerifier = address(0xCAFE);

    bytes falconPk;       // 897 bytes
    bytes falconVk;       // 1024 bytes
    bytes dilithiumPk;    // 1312 bytes

    function setUp() public {
        falconPk = new bytes(897);
        falconVk = new bytes(1024);
        dilithiumPk = new bytes(1312);
        for (uint i = 0; i < 897; i++) falconPk[i] = bytes1(uint8(i % 256));
        for (uint i = 0; i < 1024; i++) falconVk[i] = bytes1(uint8(i % 256));
        for (uint i = 0; i < 1312; i++) dilithiumPk[i] = bytes1(uint8(i % 256));
    }

    function test_falconDirectInit() public {
        FalconDirectWallet w = new FalconDirectWallet();
        w.initialize(falconPk, falconVk, payer);
        assertTrue(w.initialized());
        assertEq(w.algorithm(), 0);
        assertEq(w.payer(), payer);
        assertTrue(w.verifyKeyPointer() != address(0));
    }

    function test_dilithiumDirectInit() public {
        DilithiumDirectWallet w = new DilithiumDirectWallet();
        w.initialize(dilithiumPk, dilithiumPk, payer);
        assertTrue(w.initialized());
        assertEq(w.algorithm(), 1);
    }

    function test_falconNTTInit() public {
        FalconNTTWallet w = new FalconNTTWallet();
        w.initialize(falconPk, falconVk, payer);
        assertEq(w.algorithm(), 2);
        assertEq(w.algorithm(), 2);
    }

    function test_dilithiumNTTInit() public {
        DilithiumNTTWallet w = new DilithiumNTTWallet();
        w.initialize(dilithiumPk, dilithiumPk, payer);
        assertEq(w.algorithm(), 3);
    }

    function test_doubleInitReverts() public {
        FalconDirectWallet w = new FalconDirectWallet();
        w.initialize(falconPk, falconVk, payer);
        vm.expectRevert("Already initialized");
        w.initialize(falconPk, falconVk, payer);
    }

    function test_wrongFalconPkSize() public {
        FalconDirectWallet w = new FalconDirectWallet();
        vm.expectRevert("Falcon pk must be 897 bytes");
        w.initialize(dilithiumPk, falconVk, payer);
    }

    function test_wrongDilithiumPkSize() public {
        DilithiumDirectWallet w = new DilithiumDirectWallet();
        vm.expectRevert("Dilithium pk must be 1312 bytes");
        w.initialize(falconPk, falconPk, payer);
    }

    function test_executeRevertsNotInit() public {
        FalconDirectWallet w = new FalconDirectWallet();
        vm.prank(payer);
        vm.expectRevert("Not initialized");
        w.execute(address(1), 0, "", "");
    }

    function test_executeRevertsNotPayer() public {
        FalconDirectWallet w = new FalconDirectWallet();
        w.initialize(falconPk, falconVk, payer);
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only payer");
        w.execute(address(1), 0, "", "");
    }

    function test_executeForwardsETH() public {
        // Mock precompile 0x17 to always return 1
        bytes memory mock = hex"7f000000000000000000000000000000000000000000000000000000000000000160005260206000f3";
        vm.etch(address(0x17), mock);

        FalconDirectWallet w = new FalconDirectWallet();
        w.initialize(falconPk, falconVk, payer);
        vm.deal(address(w), 1 ether);

        Receiver r = new Receiver();
        bytes memory sig = new bytes(1064); // dummy sig

        vm.prank(payer);
        w.execute(address(r), 0.5 ether, "", sig);

        assertEq(address(r).balance, 0.5 ether);
        assertEq(w.nonce(), 1);
    }

    function test_receiveETH() public {
        FalconDirectWallet w = new FalconDirectWallet();
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(w).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(address(w).balance, 0.5 ether);
    }
}
