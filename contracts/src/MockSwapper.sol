// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Fixed-rate token swapper for demo purposes.
///         1 ETH = 2000 USD, 1 JEDKH = 0.5 ETH (= 1000 USD).
///         Must be funded with reserves of each token.
contract MockSwapper {
    address public weth;
    address public usd;
    address public jedkh;

    // Prices denominated in USD with 18 decimals
    uint256 constant WETH_PRICE  = 2000e18;  // 1 WETH = 2000 USD
    uint256 constant USD_PRICE   = 1e18;     // 1 USD  = 1 USD
    uint256 constant JEDKH_PRICE = 1000e18;  // 1 JEDKH = 1000 USD = 0.5 ETH

    constructor(address _weth, address _usd, address _jedkh) {
        weth = _weth;
        usd = _usd;
        jedkh = _jedkh;
    }

    /// @notice Swap tokenIn for tokenOut at fixed rate.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address recipient
    ) external returns (uint256 amountOut) {
        require(amountIn > 0, "Zero input");
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        amountOut = getAmountOut(tokenIn, tokenOut, amountIn);
        require(amountOut >= amountOutMin, "Insufficient output");

        IERC20(tokenOut).transfer(recipient, amountOut);
    }

    function getAmountOut(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        uint256 priceIn = _price(tokenIn);
        uint256 priceOut = _price(tokenOut);
        return amountIn * priceIn / priceOut;
    }

    function _price(address token) internal view returns (uint256) {
        if (token == weth)  return WETH_PRICE;
        if (token == usd)   return USD_PRICE;
        if (token == jedkh) return JEDKH_PRICE;
        revert("Unknown token");
    }

    /// @notice Accept ETH so the deployer can fund reserves.
    receive() external payable {}
}
