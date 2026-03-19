package api

import (
	"context"
	"math"
	"math/big"
	"net/http"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"pq-eth-backend/chain"
)

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	blockNum := uint64(0)
	bn, err := s.chain.BlockNumber(ctx)
	if err == nil {
		blockNum = bn
	}

	payerBal := "0"
	bal, err := s.chain.BalanceAt(ctx, s.chain.PayerAddress())
	if err == nil {
		payerBal = bal.String()
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":       "ok",
		"chainBlock":   blockNum,
		"payerBalance": payerBal,
	})
}

func (s *Server) handleChainBlock(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	blockNum, err := s.chain.BlockNumber(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get block number: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"blockNumber": blockNum,
	})
}

func (s *Server) handlePoolPrice(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	poolAddr := common.HexToAddress(s.cfg.Deployments.ETHUSDPool)

	// Call slot0() to get sqrtPriceX96
	slot0Data, err := chain.UniswapV3PoolABI.Pack("slot0")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode slot0 call")
		return
	}

	result, err := s.chain.CallContract(ctx, poolAddr, slot0Data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to call pool: "+err.Error())
		return
	}

	// Decode slot0 result - first 32 bytes is sqrtPriceX96
	if len(result) < 32 {
		writeError(w, http.StatusInternalServerError, "invalid slot0 response")
		return
	}

	sqrtPriceX96 := new(big.Int).SetBytes(result[:32])

	// Determine token ordering
	token0Data, _ := chain.UniswapV3PoolABI.Pack("token0")
	token0Result, err := s.chain.CallContract(ctx, poolAddr, token0Data)
	if err != nil || len(token0Result) < 32 {
		writeError(w, http.StatusInternalServerError, "failed to get token0")
		return
	}
	token0 := common.BytesToAddress(token0Result)
	wethAddr := common.HexToAddress(s.cfg.Deployments.WETH9)

	// price = (sqrtPriceX96 / 2^96)^2
	// If token0 is WETH, price = (sqrtPriceX96/2^96)^2 gives WETH price in USD
	// If token0 is USD, price = 1 / (sqrtPriceX96/2^96)^2
	price := sqrtPriceToPrice(sqrtPriceX96, token0 == wethAddr)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"price": price,
	})
}

// sqrtPriceToPrice converts sqrtPriceX96 to a human-readable price.
// wethIsToken0: if true, price = (sqrtPrice/2^96)^2; if false, price = 1/(sqrtPrice/2^96)^2
func sqrtPriceToPrice(sqrtPriceX96 *big.Int, wethIsToken0 bool) string {
	if sqrtPriceX96.Sign() == 0 {
		return "0"
	}

	// Convert to float for price calculation
	sqrtPrice := new(big.Float).SetInt(sqrtPriceX96)
	q96 := new(big.Float).SetFloat64(math.Pow(2, 96))
	ratio := new(big.Float).Quo(sqrtPrice, q96)
	price := new(big.Float).Mul(ratio, ratio)

	if !wethIsToken0 {
		// Invert: we want price of WETH in terms of USD
		one := new(big.Float).SetFloat64(1.0)
		price = new(big.Float).Quo(one, price)
	}

	priceStr := price.Text('f', 2)
	return priceStr
}
