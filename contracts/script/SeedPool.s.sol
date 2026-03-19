// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IWETH9 {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

interface IUniswapV3Pool {
    function initialize(uint160 sqrtPriceX96) external;
    function token0() external view returns (address);
    function token1() external view returns (address);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function liquidity() external view returns (uint128);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

contract SeedPool is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        // Read deployment addresses
        string memory coreJson = vm.readFile("deployments.json");
        address weth9 = vm.parseJsonAddress(coreJson, ".WETH9");
        address usd = vm.parseJsonAddress(coreJson, ".USD");
        address pool = vm.parseJsonAddress(coreJson, ".ETH_USD_Pool");
        address nftManager = vm.parseJsonAddress(coreJson, ".NonfungiblePositionManager");

        // Determine token ordering
        address token0 = IUniswapV3Pool(pool).token0();
        address token1 = IUniswapV3Pool(pool).token1();

        // Calculate sqrtPriceX96 for $2,000/ETH
        // price = token1/token0 in Uniswap V3
        // If token0 = WETH, token1 = USD: price = 2000
        //   sqrtPriceX96 = sqrt(2000) * 2^96 = 44.7214 * 2^96 ≈ 3543191142285914205922034323215
        // If token0 = USD, token1 = WETH: price = 1/2000 = 0.0005
        //   sqrtPriceX96 = sqrt(1/2000) * 2^96 = 0.02236 * 2^96 ≈ 1771595571142957028654914
        uint160 sqrtPriceX96;
        if (token0 == weth9) {
            // token0 = WETH, price = 2000 USD per WETH
            sqrtPriceX96 = 3543191142285914205922034323215;
        } else {
            // token0 = USD, price = 0.0005 WETH per USD
            sqrtPriceX96 = 1771595571142957028654914;
        }

        vm.startBroadcast(deployerKey);

        // 1. Initialize pool
        IUniswapV3Pool(pool).initialize(sqrtPriceX96);

        // 2. Wrap 100 ETH into WETH
        IWETH9(weth9).deposit{value: 100 ether}();

        // 3. Approve tokens to NonfungiblePositionManager
        IWETH9(weth9).approve(nftManager, type(uint256).max);
        IERC20(usd).approve(nftManager, type(uint256).max);

        // 4. Add full-range liquidity
        uint256 amount0Desired;
        uint256 amount1Desired;
        if (token0 == weth9) {
            amount0Desired = 100 ether;      // 100 WETH
            amount1Desired = 200_000 ether;  // 200,000 USD
        } else {
            amount0Desired = 200_000 ether;  // 200,000 USD
            amount1Desired = 100 ether;      // 100 WETH
        }

        INonfungiblePositionManager(nftManager).mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: 3000,
                tickLower: -887220,
                tickUpper: 887220,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 0,
                amount1Min: 0,
                recipient: deployer,
                deadline: block.timestamp + 3600
            })
        );

        vm.stopBroadcast();

        // 5. Verify pool has liquidity
        (uint160 finalSqrtPrice,,,,,, ) = IUniswapV3Pool(pool).slot0();
        uint128 liq = IUniswapV3Pool(pool).liquidity();
        require(finalSqrtPrice > 0, "Pool not initialized");
        require(liq > 0, "Pool has no liquidity");
    }
}
