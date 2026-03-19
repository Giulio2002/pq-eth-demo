// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/USD.sol";

contract USDTest is Test {
    USD usd;
    address owner;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        owner = address(this);
        usd = new USD();
    }

    function test_nameAndSymbol() public view {
        assertEq(usd.name(), "USD Stablecoin");
        assertEq(usd.symbol(), "USD");
    }

    function test_mintByOwner() public {
        usd.mint(alice, 1000 ether);
        assertEq(usd.balanceOf(alice), 1000 ether);
    }

    function test_mintRevertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        usd.mint(alice, 1000 ether);
    }

    function test_transfer() public {
        usd.mint(alice, 1000 ether);
        vm.prank(alice);
        usd.transfer(bob, 300 ether);
        assertEq(usd.balanceOf(alice), 700 ether);
        assertEq(usd.balanceOf(bob), 300 ether);
    }

    function test_approve() public {
        usd.mint(alice, 1000 ether);
        vm.prank(alice);
        usd.approve(bob, 500 ether);
        assertEq(usd.allowance(alice, bob), 500 ether);
    }

    function test_transferFrom() public {
        usd.mint(alice, 1000 ether);
        vm.prank(alice);
        usd.approve(bob, 500 ether);

        vm.prank(bob);
        usd.transferFrom(alice, bob, 200 ether);
        assertEq(usd.balanceOf(bob), 200 ether);
        assertEq(usd.allowance(alice, bob), 300 ether);
    }

    function test_ownerIsDeployer() public view {
        assertEq(usd.owner(), owner);
    }
}
