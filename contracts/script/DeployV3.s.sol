// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IUniswapV3Factory {
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
}

contract DeployV3 is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));

        // Read USD address from core deployments
        string memory coreJson = vm.readFile("deployments.json");
        address usd = vm.parseJsonAddress(coreJson, ".USD");

        // Read pre-compiled V3 bytecodes from artifact JSON files
        bytes memory weth9Code = _loadBytecode("contracts/out/v3/WETH9.sol/WETH9.json");
        bytes memory factoryCode = _loadBytecode("contracts/out/v3/UniswapV3Factory.sol/UniswapV3Factory.json");
        bytes memory swapRouterCode = _loadBytecode("contracts/out/v3/SwapRouter.sol/SwapRouter.json");
        bytes memory nftCode = _loadBytecode("contracts/out/v3/NonfungiblePositionManager.sol/NonfungiblePositionManager.json");
        bytes memory quoterCode = _loadBytecode("contracts/out/v3/QuoterV2.sol/QuoterV2.json");

        vm.startBroadcast(deployerKey);

        // 1. Deploy WETH9
        address weth9;
        assembly { weth9 := create(0, add(weth9Code, 0x20), mload(weth9Code)) }
        require(weth9 != address(0), "WETH9 deploy failed");

        // 2. Deploy UniswapV3Factory
        address factory;
        assembly { factory := create(0, add(factoryCode, 0x20), mload(factoryCode)) }
        require(factory != address(0), "UniswapV3Factory deploy failed");

        // 3. Deploy SwapRouter(factory, weth9)
        address swapRouter;
        bytes memory srInit = abi.encodePacked(swapRouterCode, abi.encode(factory, weth9));
        assembly { swapRouter := create(0, add(srInit, 0x20), mload(srInit)) }
        require(swapRouter != address(0), "SwapRouter deploy failed");

        // 4. Deploy NonfungiblePositionManager(factory, weth9, tokenDescriptor)
        address nftManager;
        bytes memory nftInit = abi.encodePacked(nftCode, abi.encode(factory, weth9, address(0)));
        assembly { nftManager := create(0, add(nftInit, 0x20), mload(nftInit)) }
        require(nftManager != address(0), "NonfungiblePositionManager deploy failed");

        // 5. Deploy QuoterV2(factory, weth9)
        address quoter;
        bytes memory quoterInit = abi.encodePacked(quoterCode, abi.encode(factory, weth9));
        assembly { quoter := create(0, add(quoterInit, 0x20), mload(quoterInit)) }
        require(quoter != address(0), "QuoterV2 deploy failed");

        // 6. Create WETH-USD pool
        address pool = IUniswapV3Factory(factory).createPool(weth9, usd, 3000);

        vm.stopBroadcast();

        // 7. Write deployments.v3.json
        string memory json = string(abi.encodePacked(
            '{\n  "WETH9": "', vm.toString(weth9),
            '",\n  "UniswapV3Factory": "', vm.toString(factory),
            '",\n  "SwapRouter": "', vm.toString(swapRouter),
            '",\n  "NonfungiblePositionManager": "', vm.toString(nftManager),
            '",\n  "QuoterV2": "', vm.toString(quoter),
            '",\n  "ETH_USD_Pool": "', vm.toString(pool),
            '"\n}'
        ));
        vm.writeFile("deployments.v3.json", json);
    }

    function _loadBytecode(string memory artifactPath) internal view returns (bytes memory) {
        string memory json = vm.readFile(artifactPath);
        return vm.parseJsonBytes(json, ".bytecode.object");
    }
}
