package chain

import (
	"github.com/ethereum/go-ethereum/accounts/abi"
	"strings"
)

// ABI definitions for the contracts we interact with.

const factoryABIJSON = `[
	{
		"inputs": [
			{"name": "publicKey", "type": "bytes"},
			{"name": "verifyKey", "type": "bytes"},
			{"name": "algorithm", "type": "uint8"},
			{"name": "payer", "type": "address"}
		],
		"name": "createWallet",
		"outputs": [{"name": "wallet", "type": "address"}],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "name": "wallet", "type": "address"},
			{"indexed": true, "name": "owner", "type": "address"},
			{"indexed": false, "name": "algorithm", "type": "uint8"}
		],
		"name": "WalletCreated",
		"type": "event"
	}
]`

const walletABIJSON = `[
	{
		"inputs": [
			{"name": "to", "type": "address"},
			{"name": "value", "type": "uint256"},
			{"name": "data", "type": "bytes"},
			{"name": "signature", "type": "bytes"}
		],
		"name": "execute",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{"name": "targets", "type": "address[]"},
			{"name": "values", "type": "uint256[]"},
			{"name": "datas", "type": "bytes[]"},
			{"name": "signature", "type": "bytes"}
		],
		"name": "executeBatch",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{"name": "_publicKey", "type": "bytes"},
			{"name": "_verifyKey", "type": "bytes"},
			{"name": "_payer", "type": "address"}
		],
		"name": "initialize",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "nonce",
		"outputs": [{"name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "publicKey",
		"outputs": [{"name": "", "type": "bytes"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "algorithm",
		"outputs": [{"name": "", "type": "uint8"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "payer",
		"outputs": [{"name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

const erc20ABIJSON = `[
	{
		"inputs": [{"name": "account", "type": "address"}],
		"name": "balanceOf",
		"outputs": [{"name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"name": "spender", "type": "address"},
			{"name": "amount", "type": "uint256"}
		],
		"name": "approve",
		"outputs": [{"name": "", "type": "bool"}],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

const weth9ABIJSON = `[
	{
		"inputs": [],
		"name": "deposit",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [{"name": "account", "type": "address"}],
		"name": "balanceOf",
		"outputs": [{"name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"name": "spender", "type": "address"},
			{"name": "amount", "type": "uint256"}
		],
		"name": "approve",
		"outputs": [{"name": "", "type": "bool"}],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

const swapRouterABIJSON = `[
	{
		"inputs": [
			{
				"components": [
					{"name": "tokenIn", "type": "address"},
					{"name": "tokenOut", "type": "address"},
					{"name": "fee", "type": "uint24"},
					{"name": "recipient", "type": "address"},
					{"name": "deadline", "type": "uint256"},
					{"name": "amountIn", "type": "uint256"},
					{"name": "amountOutMinimum", "type": "uint256"},
					{"name": "sqrtPriceLimitX96", "type": "uint160"}
				],
				"name": "params",
				"type": "tuple"
			}
		],
		"name": "exactInputSingle",
		"outputs": [{"name": "amountOut", "type": "uint256"}],
		"stateMutability": "payable",
		"type": "function"
	}
]`

const quoterV2ABIJSON = `[
	{
		"inputs": [
			{
				"components": [
					{"name": "tokenIn", "type": "address"},
					{"name": "tokenOut", "type": "address"},
					{"name": "amountIn", "type": "uint256"},
					{"name": "fee", "type": "uint24"},
					{"name": "sqrtPriceLimitX96", "type": "uint160"}
				],
				"name": "params",
				"type": "tuple"
			}
		],
		"name": "quoteExactInputSingle",
		"outputs": [
			{"name": "amountOut", "type": "uint256"},
			{"name": "sqrtPriceX96After", "type": "uint160"},
			{"name": "initializedTicksCrossed", "type": "uint32"},
			{"name": "gasEstimate", "type": "uint256"}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

const uniswapV3PoolABIJSON = `[
	{
		"inputs": [],
		"name": "slot0",
		"outputs": [
			{"name": "sqrtPriceX96", "type": "uint160"},
			{"name": "tick", "type": "int24"},
			{"name": "observationIndex", "type": "uint16"},
			{"name": "observationCardinality", "type": "uint16"},
			{"name": "observationCardinalityNext", "type": "uint16"},
			{"name": "feeProtocol", "type": "uint8"},
			{"name": "unlocked", "type": "bool"}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "token0",
		"outputs": [{"name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "token1",
		"outputs": [{"name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

const mockSwapperABIJSON = `[
	{
		"inputs": [
			{"name": "tokenIn", "type": "address"},
			{"name": "tokenOut", "type": "address"},
			{"name": "amountIn", "type": "uint256"},
			{"name": "amountOutMin", "type": "uint256"},
			{"name": "recipient", "type": "address"}
		],
		"name": "swap",
		"outputs": [{"name": "amountOut", "type": "uint256"}],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

var (
	FactoryABI       abi.ABI
	WalletABI        abi.ABI
	ERC20ABI         abi.ABI
	WETH9ABI         abi.ABI
	SwapRouterABI    abi.ABI
	QuoterV2ABI      abi.ABI
	UniswapV3PoolABI abi.ABI
	MockSwapperABI   abi.ABI
)

func init() {
	var err error
	FactoryABI, err = abi.JSON(strings.NewReader(factoryABIJSON))
	if err != nil {
		panic("parsing factory ABI: " + err.Error())
	}
	WalletABI, err = abi.JSON(strings.NewReader(walletABIJSON))
	if err != nil {
		panic("parsing wallet ABI: " + err.Error())
	}
	ERC20ABI, err = abi.JSON(strings.NewReader(erc20ABIJSON))
	if err != nil {
		panic("parsing ERC20 ABI: " + err.Error())
	}
	WETH9ABI, err = abi.JSON(strings.NewReader(weth9ABIJSON))
	if err != nil {
		panic("parsing WETH9 ABI: " + err.Error())
	}
	SwapRouterABI, err = abi.JSON(strings.NewReader(swapRouterABIJSON))
	if err != nil {
		panic("parsing SwapRouter ABI: " + err.Error())
	}
	QuoterV2ABI, err = abi.JSON(strings.NewReader(quoterV2ABIJSON))
	if err != nil {
		panic("parsing QuoterV2 ABI: " + err.Error())
	}
	UniswapV3PoolABI, err = abi.JSON(strings.NewReader(uniswapV3PoolABIJSON))
	if err != nil {
		panic("parsing UniswapV3Pool ABI: " + err.Error())
	}
	MockSwapperABI, err = abi.JSON(strings.NewReader(mockSwapperABIJSON))
	if err != nil {
		panic("parsing MockSwapper ABI: " + err.Error())
	}
}
