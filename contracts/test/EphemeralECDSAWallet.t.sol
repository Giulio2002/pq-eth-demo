// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/EphemeralECDSAWallet.sol";

contract Receiver {
    uint256 public received;
    function receiveETH() external payable { received += msg.value; }
    receive() external payable {}
}

contract EphemeralECDSAWalletTest is Test {
    event SignerRotated(address indexed oldSigner, address indexed newSigner, uint256 nonce);

    EphemeralECDSAWallet wallet;
    Receiver receiver;
    address payer = address(0xBEEF);

    // Ephemeral key pairs — each used exactly once
    uint256 constant KEY1_PK = 0x1111111111111111111111111111111111111111111111111111111111111111;
    uint256 constant KEY2_PK = 0x2222222222222222222222222222222222222222222222222222222222222222;
    uint256 constant KEY3_PK = 0x3333333333333333333333333333333333333333333333333333333333333333;

    address key1Addr;
    address key2Addr;
    address key3Addr;

    function setUp() public {
        key1Addr = vm.addr(KEY1_PK);
        key2Addr = vm.addr(KEY2_PK);
        key3Addr = vm.addr(KEY3_PK);

        wallet = new EphemeralECDSAWallet();
        wallet.initialize(abi.encodePacked(key1Addr), "", payer);

        receiver = new Receiver();
        vm.deal(address(wallet), 10 ether);
    }

    // --- Initialization ---

    function test_init() public view {
        assertTrue(wallet.initialized());
        assertEq(wallet.algorithm(), 4);
        assertEq(wallet.currentSigner(), key1Addr);
        assertEq(wallet.payer(), payer);
        assertEq(wallet.nonce(), 0);
    }

    function test_doubleInitReverts() public {
        vm.expectRevert("Already initialized");
        wallet.initialize(abi.encodePacked(key1Addr), "", payer);
    }

    function test_wrongPkSizeReverts() public {
        EphemeralECDSAWallet w2 = new EphemeralECDSAWallet();
        vm.expectRevert("Ephemeral pk must be 20-byte address");
        w2.initialize(new bytes(32), "", payer);
    }

    // --- Execute with rotation ---

    function _signExecute(
        uint256 privKey,
        address to, uint256 value, bytes memory data,
        uint256 n, address nextSigner
    ) internal view returns (bytes memory) {
        bytes32 msgHash = keccak256(abi.encodePacked(to, value, data, n, block.chainid, nextSigner));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, msgHash);
        return abi.encodePacked(r, s, v, nextSigner);
    }

    function test_executeAndRotate() public {
        bytes memory sig = _signExecute(KEY1_PK, address(receiver), 1 ether, "", 0, key2Addr);

        vm.prank(payer);
        wallet.execute(address(receiver), 1 ether, "", sig);

        assertEq(address(receiver).balance, 1 ether);
        assertEq(wallet.currentSigner(), key2Addr);
        assertEq(wallet.nonce(), 1);
    }

    function test_consecutiveRotations() public {
        // Tx 1: key1 -> key2
        bytes memory sig1 = _signExecute(KEY1_PK, address(receiver), 0.1 ether, "", 0, key2Addr);
        vm.prank(payer);
        wallet.execute(address(receiver), 0.1 ether, "", sig1);
        assertEq(wallet.currentSigner(), key2Addr);

        // Tx 2: key2 -> key3
        bytes memory sig2 = _signExecute(KEY2_PK, address(receiver), 0.2 ether, "", 1, key3Addr);
        vm.prank(payer);
        wallet.execute(address(receiver), 0.2 ether, "", sig2);
        assertEq(wallet.currentSigner(), key3Addr);
        assertEq(wallet.nonce(), 2);
        assertEq(address(receiver).balance, 0.3 ether);
    }

    function test_oldKeyCannotSignAfterRotation() public {
        // Rotate key1 -> key2
        bytes memory sig1 = _signExecute(KEY1_PK, address(receiver), 0.1 ether, "", 0, key2Addr);
        vm.prank(payer);
        wallet.execute(address(receiver), 0.1 ether, "", sig1);

        // Try to use key1 again — should fail
        bytes memory sigOld = _signExecute(KEY1_PK, address(receiver), 0.1 ether, "", 1, key3Addr);
        vm.prank(payer);
        vm.expectRevert("Invalid ephemeral sig");
        wallet.execute(address(receiver), 0.1 ether, "", sigOld);
    }

    // --- Execute batch with rotation ---

    function test_executeBatchAndRotate() public {
        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory datas = new bytes[](2);

        targets[0] = address(receiver);
        targets[1] = address(receiver);
        values[0] = 0.5 ether;
        values[1] = 0.3 ether;
        datas[0] = "";
        datas[1] = "";

        bytes32 msgHash = keccak256(abi.encode(targets, values, datas, uint256(0), block.chainid, key2Addr));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY1_PK, msgHash);
        bytes memory sig = abi.encodePacked(r, s, v, key2Addr);

        vm.prank(payer);
        wallet.executeBatch(targets, values, datas, sig);

        assertEq(address(receiver).balance, 0.8 ether);
        assertEq(wallet.currentSigner(), key2Addr);
        assertEq(wallet.nonce(), 1);
    }

    // --- Failure modes ---

    function test_wrongSignerReverts() public {
        // Sign with key2 but wallet expects key1
        bytes memory sig = _signExecute(KEY2_PK, address(receiver), 1 ether, "", 0, key3Addr);
        vm.prank(payer);
        vm.expectRevert("Invalid ephemeral sig");
        wallet.execute(address(receiver), 1 ether, "", sig);
    }

    function test_notPayerReverts() public {
        bytes memory sig = _signExecute(KEY1_PK, address(receiver), 1 ether, "", 0, key2Addr);
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only payer");
        wallet.execute(address(receiver), 1 ether, "", sig);
    }

    function test_badSigLengthReverts() public {
        vm.prank(payer);
        vm.expectRevert("Sig must be 85 bytes");
        wallet.execute(address(receiver), 0, "", new bytes(64));
    }

    function test_zeroNextSignerReverts() public {
        bytes32 msgHash = keccak256(abi.encodePacked(address(receiver), uint256(0), bytes(""), uint256(0), block.chainid, address(0)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(KEY1_PK, msgHash);
        bytes memory sig = abi.encodePacked(r, s, v, address(0));

        vm.prank(payer);
        vm.expectRevert("Zero next signer");
        wallet.execute(address(receiver), 0, "", sig);
    }

    function test_notInitializedReverts() public {
        EphemeralECDSAWallet w2 = new EphemeralECDSAWallet();
        vm.prank(payer);
        vm.expectRevert("Not initialized");
        w2.execute(address(1), 0, "", new bytes(85));
    }

    function test_receiveETH() public {
        EphemeralECDSAWallet w2 = new EphemeralECDSAWallet();
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(w2).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(address(w2).balance, 0.5 ether);
    }

    // --- SignerRotated event ---

    function test_emitsSignerRotated() public {
        bytes memory sig = _signExecute(KEY1_PK, address(receiver), 0, "", 0, key2Addr);

        vm.expectEmit(true, true, false, true);
        emit SignerRotated(key1Addr, key2Addr, 0);

        vm.prank(payer);
        wallet.execute(address(receiver), 0, "", sig);
    }
}
