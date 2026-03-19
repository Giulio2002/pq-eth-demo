package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"pq-eth-backend/chain"
	"pq-eth-backend/db"
)

type executeRequest struct {
	Wallet    string `json:"wallet"`
	To        string `json:"to"`
	Value     string `json:"value"`
	Data      string `json:"data"`
	Signature string `json:"signature"`
}

type executeBatchRequest struct {
	Wallet    string   `json:"wallet"`
	Targets   []string `json:"targets"`
	Values    []string `json:"values"`
	Datas     []string `json:"datas"`
	Signature string   `json:"signature"`
}

type swapRequest struct {
	Wallet       string `json:"wallet"`
	Direction    string `json:"direction"`
	AmountIn     string `json:"amountIn"`
	MinAmountOut string `json:"minAmountOut"`
	Signature    string `json:"signature"`
}

func (s *Server) handleExecute(w http.ResponseWriter, r *http.Request) {
	var req executeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Wallet == "" || req.To == "" || req.Signature == "" {
		writeError(w, http.StatusBadRequest, "wallet, to, and signature are required")
		return
	}

	// Verify wallet exists
	wallet, err := s.db.GetWallet(strings.ToLower(req.Wallet))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if wallet == nil {
		writeError(w, http.StatusNotFound, "wallet not found")
		return
	}

	// Parse values
	toAddr := common.HexToAddress(req.To)

	value := new(big.Int)
	if req.Value != "" {
		value.SetString(strings.TrimPrefix(req.Value, "0x"), 16)
	}

	var dataBytes []byte
	if req.Data != "" && req.Data != "0x" {
		dataBytes, err = hexDecode(req.Data)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid data hex")
			return
		}
	}

	sigBytes, err := hexDecode(req.Signature)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid signature hex")
		return
	}

	log.Printf("execute: wallet=%s algo=%s sigLen=%d sigFirst4=%x", wallet.Address, wallet.Algorithm, len(sigBytes), sigBytes[:min(4,len(sigBytes))])

	// Save last sig for debugging
	if len(sigBytes) > 0 {
		_ = os.WriteFile("/tmp/last_dilithium_sig.hex", []byte(req.Signature), 0644)
		_ = os.WriteFile("/tmp/last_execute_req.json", []byte(fmt.Sprintf(`{"wallet":"%s","to":"%s","value":"%s","sigLen":%d,"algo":"%s"}`, req.Wallet, req.To, req.Value, len(sigBytes), wallet.Algorithm)), 0644)
	}

	// Encode wallet.execute(to, value, data, signature)
	calldata, err := chain.WalletABI.Pack("execute", toAddr, value, dataBytes, sigBytes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode calldata: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	walletAddr := common.HexToAddress(req.Wallet)
	tx, err := s.chain.SendTransaction(ctx, walletAddr, calldata, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to send transaction: "+err.Error())
		return
	}

	// Store as pending
	dbTx := &db.Transaction{
		TxHash:        tx.Hash().Hex(),
		WalletAddress: wallet.Address,
		ToAddress:     strings.ToLower(req.To),
		Value:         req.Value,
		Data:          req.Data,
		Status:        "pending",
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		Type:          "execute",
	}
	if err := s.db.InsertTransaction(dbTx); err != nil {
		log.Printf("error storing tx: %v", err)
	}

	// Wait for receipt
	receipt, err := s.chain.WaitForReceipt(ctx, tx.Hash())
	success := true
	if err == nil {
		status := "success"
		if receipt.Status == 0 {
			status = "failed"
			success = false
		}
		blockNum := receipt.BlockNumber.Int64()
		_ = s.db.UpdateTransactionStatus(tx.Hash().Hex(), status, blockNum, time.Now().UTC().Format(time.RFC3339))
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"txHash":  tx.Hash().Hex(),
		"success": success,
	})
}

func (s *Server) handleExecuteBatch(w http.ResponseWriter, r *http.Request) {
	var req executeBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Wallet == "" || req.Signature == "" {
		writeError(w, http.StatusBadRequest, "wallet and signature are required")
		return
	}
	if len(req.Targets) == 0 || len(req.Targets) != len(req.Values) || len(req.Values) != len(req.Datas) {
		writeError(w, http.StatusBadRequest, "targets, values, and datas must have the same non-zero length")
		return
	}

	wallet, err := s.db.GetWallet(strings.ToLower(req.Wallet))
	if err != nil || wallet == nil {
		writeError(w, http.StatusNotFound, "wallet not found")
		return
	}

	targets := make([]common.Address, len(req.Targets))
	values := make([]*big.Int, len(req.Values))
	datas := make([][]byte, len(req.Datas))

	for i := range req.Targets {
		targets[i] = common.HexToAddress(req.Targets[i])
		values[i] = new(big.Int)
		if req.Values[i] != "" {
			values[i].SetString(strings.TrimPrefix(req.Values[i], "0x"), 16)
		}
		if req.Datas[i] != "" && req.Datas[i] != "0x" {
			datas[i], err = hexDecode(req.Datas[i])
			if err != nil {
				writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid data hex at index %d", i))
				return
			}
		}
	}

	sigBytes, err := hexDecode(req.Signature)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid signature hex")
		return
	}

	calldata, err := chain.WalletABI.Pack("executeBatch", targets, values, datas, sigBytes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode calldata: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	walletAddr := common.HexToAddress(req.Wallet)
	tx, err := s.chain.SendTransaction(ctx, walletAddr, calldata, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to send transaction: "+err.Error())
		return
	}

	dbTx := &db.Transaction{
		TxHash:        tx.Hash().Hex(),
		WalletAddress: wallet.Address,
		ToAddress:     strings.ToLower(req.Targets[0]),
		Value:         req.Values[0],
		Status:        "pending",
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		Type:          "batch",
	}
	_ = s.db.InsertTransaction(dbTx)

	receipt, err := s.chain.WaitForReceipt(ctx, tx.Hash())
	success := true
	if err == nil {
		status := "success"
		if receipt.Status == 0 {
			status = "failed"
			success = false
		}
		_ = s.db.UpdateTransactionStatus(tx.Hash().Hex(), status, receipt.BlockNumber.Int64(), time.Now().UTC().Format(time.RFC3339))
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"txHash":  tx.Hash().Hex(),
		"success": success,
	})
}

func (s *Server) handleSwap(w http.ResponseWriter, r *http.Request) {
	var req swapRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Wallet == "" || req.Direction == "" || req.AmountIn == "" || req.Signature == "" {
		writeError(w, http.StatusBadRequest, "wallet, direction, amountIn, and signature are required")
		return
	}

	if req.Direction != "eth_to_usd" && req.Direction != "usd_to_eth" {
		writeError(w, http.StatusBadRequest, "direction must be eth_to_usd or usd_to_eth")
		return
	}

	wallet, err := s.db.GetWallet(strings.ToLower(req.Wallet))
	if err != nil || wallet == nil {
		writeError(w, http.StatusNotFound, "wallet not found")
		return
	}

	amountIn := new(big.Int)
	amountIn.SetString(req.AmountIn, 10)
	if amountIn.Sign() <= 0 {
		writeError(w, http.StatusBadRequest, "amountIn must be positive")
		return
	}

	minAmountOut := new(big.Int)
	if req.MinAmountOut != "" {
		minAmountOut.SetString(req.MinAmountOut, 10)
	}

	sigBytes, err := hexDecode(req.Signature)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid signature hex")
		return
	}

	// Build batch calldata
	targets, values, datas, err := s.buildSwapBatch(req.Direction, common.HexToAddress(req.Wallet), amountIn, minAmountOut)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build swap batch: "+err.Error())
		return
	}

	calldata, err := chain.WalletABI.Pack("executeBatch", targets, values, datas, sigBytes)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode calldata: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	walletAddr := common.HexToAddress(req.Wallet)
	tx, err := s.chain.SendTransaction(ctx, walletAddr, calldata, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to send transaction: "+err.Error())
		return
	}

	dbTx := &db.Transaction{
		TxHash:        tx.Hash().Hex(),
		WalletAddress: wallet.Address,
		ToAddress:     strings.ToLower(s.cfg.Deployments.SwapRouter),
		Value:         "0x" + amountIn.Text(16),
		Status:        "pending",
		Timestamp:     time.Now().UTC().Format(time.RFC3339),
		Type:          "swap",
	}
	_ = s.db.InsertTransaction(dbTx)

	receipt, err := s.chain.WaitForReceipt(ctx, tx.Hash())
	success := true
	if err == nil {
		status := "success"
		if receipt.Status == 0 {
			status = "failed"
			success = false
		}
		_ = s.db.UpdateTransactionStatus(tx.Hash().Hex(), status, receipt.BlockNumber.Int64(), time.Now().UTC().Format(time.RFC3339))
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"txHash":    tx.Hash().Hex(),
		"success":   success,
		"amountIn":  req.AmountIn,
		"direction": req.Direction,
	})
}

func (s *Server) buildSwapBatch(direction string, walletAddr common.Address, amountIn, minAmountOut *big.Int) ([]common.Address, []*big.Int, [][]byte, error) {
	weth := common.HexToAddress(s.cfg.Deployments.WETH9)
	usd := common.HexToAddress(s.cfg.Deployments.USD)
	router := common.HexToAddress(s.cfg.Deployments.SwapRouter)

	if direction == "eth_to_usd" {
		// Step 1: WETH.deposit() with ETH value
		depositData, err := chain.WETH9ABI.Pack("deposit")
		if err != nil {
			return nil, nil, nil, fmt.Errorf("encoding deposit: %w", err)
		}

		// Step 2: WETH.approve(SwapRouter, amountIn)
		approveData, err := chain.ERC20ABI.Pack("approve", router, amountIn)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("encoding approve: %w", err)
		}

		// Step 3: SwapRouter.exactInputSingle
		deadline := new(big.Int).SetInt64(time.Now().Add(10 * time.Minute).Unix())
		type ExactInputSingleParams struct {
			TokenIn           common.Address
			TokenOut          common.Address
			Fee               *big.Int
			Recipient         common.Address
			Deadline          *big.Int
			AmountIn          *big.Int
			AmountOutMinimum  *big.Int
			SqrtPriceLimitX96 *big.Int
		}
		params := ExactInputSingleParams{
			TokenIn:           weth,
			TokenOut:          usd,
			Fee:               big.NewInt(3000),
			Recipient:         walletAddr,
			Deadline:          deadline,
			AmountIn:          amountIn,
			AmountOutMinimum:  minAmountOut,
			SqrtPriceLimitX96: big.NewInt(0),
		}
		swapData, err := chain.SwapRouterABI.Pack("exactInputSingle", params)
		if err != nil {
			return nil, nil, nil, fmt.Errorf("encoding swap: %w", err)
		}

		targets := []common.Address{weth, weth, router}
		values := []*big.Int{amountIn, big.NewInt(0), big.NewInt(0)}
		datas := [][]byte{depositData, approveData, swapData}
		return targets, values, datas, nil
	}

	// usd_to_eth
	// Step 1: USD.approve(SwapRouter, amountIn)
	approveData, err := chain.ERC20ABI.Pack("approve", router, amountIn)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("encoding approve: %w", err)
	}

	// Step 2: SwapRouter.exactInputSingle (USD -> WETH)
	deadline := new(big.Int).SetInt64(time.Now().Add(10 * time.Minute).Unix())
	type ExactInputSingleParams struct {
		TokenIn           common.Address
		TokenOut          common.Address
		Fee               *big.Int
		Recipient         common.Address
		Deadline          *big.Int
		AmountIn          *big.Int
		AmountOutMinimum  *big.Int
		SqrtPriceLimitX96 *big.Int
	}
	params := ExactInputSingleParams{
		TokenIn:           usd,
		TokenOut:          weth,
		Fee:               big.NewInt(3000),
		Recipient:         walletAddr,
		Deadline:          deadline,
		AmountIn:          amountIn,
		AmountOutMinimum:  minAmountOut,
		SqrtPriceLimitX96: big.NewInt(0),
	}
	swapData, err := chain.SwapRouterABI.Pack("exactInputSingle", params)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("encoding swap: %w", err)
	}

	targets := []common.Address{usd, router}
	values := []*big.Int{big.NewInt(0), big.NewInt(0)}
	datas := [][]byte{approveData, swapData}
	return targets, values, datas, nil
}
