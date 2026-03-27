package api

import (
	"context"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"pq-eth-backend/chain"
)

func (s *Server) handleExplorerStats(w http.ResponseWriter, r *http.Request) {
	walletStats, err := s.db.GetWalletStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	txStats, err := s.db.GetTransactionStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	currentBlock := uint64(0)
	if bn, err := s.chain.BlockNumber(ctx); err == nil {
		currentBlock = bn
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"totalWallets":          walletStats.Total,
		"totalTransactions":     txStats.Total,
		"falconWallets":         walletStats.Falcon,
		"dilithiumWallets":      walletStats.Dilithium,
		"falconTransactions":    txStats.Falcon,
		"dilithiumTransactions":   txStats.Dilithium,
		"ephemeralEcdsaWallets":   walletStats.EphemeralECDSA,
		"currentBlock":            currentBlock,
	})
}

func (s *Server) handleRecentTransactions(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	txs, err := s.db.GetRecentTransactions(limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	// Transform to explorer format
	result := make([]map[string]interface{}, 0, len(txs))
	for _, tx := range txs {
		// Deploy transactions are plain ECDSA (payer deploys via factory)
		// Only execute/batch/swap use PQ signatures
		scheme := algorithmToScheme(tx.Algorithm)
		gas := algorithmToGas(tx.Algorithm)
		if tx.Type == "deploy" {
			scheme = "ecdsa"
			gas = 0
		}
		entry := map[string]interface{}{
			"txHash":          tx.TxHash,
			"walletAddress":   tx.WalletAddress,
			"to":              tx.ToAddress,
			"value":           tx.Value,
			"status":          tx.Status,
			"type":            tx.Type,
			"signatureScheme": scheme,
			"verificationGas": gas,
		}
		if tx.BlockNumber != nil {
			entry["blockNumber"] = *tx.BlockNumber
		}
		if tx.Timestamp != "" {
			entry["timestamp"] = tx.Timestamp
		}
		result = append(result, entry)
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRecentBlocks(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	latestBlock, err := s.chain.BlockNumber(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get block number: "+err.Error())
		return
	}

	blocks := make([]map[string]interface{}, 0, limit)
	for i := 0; i < limit && latestBlock > 0; i++ {
		blockNum := latestBlock - uint64(i)
		header, err := s.chain.HeaderByNumber(ctx, new(big.Int).SetUint64(blockNum))
		if err != nil {
			continue
		}

		blocks = append(blocks, map[string]interface{}{
			"blockNumber": blockNum,
			"blockHash":   header.Hash().Hex(),
			"timestamp":   time.Unix(int64(header.Time), 0).UTC().Format(time.RFC3339),
			"gasUsed":     header.GasUsed,
		})
	}

	writeJSON(w, http.StatusOK, blocks)
}

func (s *Server) handleExplorerTx(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, http.StatusBadRequest, "hash required")
		return
	}

	tx, err := s.db.GetTransaction(hash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}
	if tx == nil {
		writeError(w, http.StatusNotFound, "transaction not found")
		return
	}

	wallet, err := s.db.GetWallet(tx.WalletAddress)
	if err != nil || wallet == nil {
		writeError(w, http.StatusInternalServerError, "wallet lookup failed")
		return
	}

	scheme := algorithmToScheme(wallet.Algorithm)
	verifyGas := algorithmToGas(wallet.Algorithm)
	// Deploy transactions are plain ECDSA
	if tx.Type == "deploy" {
		scheme = "ecdsa"
		verifyGas = 0
	}
	gasUsed := uint64(0)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	receipt, err := s.chain.TransactionReceipt(ctx, common.HexToHash(hash))
	if err == nil {
		gasUsed = receipt.GasUsed
	}

	result := map[string]interface{}{
		"txHash":            tx.TxHash,
		"walletAddress":     tx.WalletAddress,
		"to":                tx.ToAddress,
		"value":             tx.Value,
		"data":              tx.Data,
		"status":            tx.Status,
		"type":              tx.Type,
		"signatureScheme":   scheme,
		"publicKey":         wallet.PublicKey,
		"precompileAddress": algorithmToPrecompile(wallet.Algorithm),
		"verificationGas":   verifyGas,
		"gasUsed":           gasUsed,
		"isMigrated7702":    wallet.IsMigrated7702,
	}
	if tx.BlockNumber != nil {
		result["blockNumber"] = *tx.BlockNumber
	}
	if tx.Timestamp != "" {
		result["timestamp"] = tx.Timestamp
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleExplorerWallets(w http.ResponseWriter, r *http.Request) {
	algorithm := r.URL.Query().Get("algorithm")
	sort := r.URL.Query().Get("sort")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")

	limit := 50
	offset := 0
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	wallets, err := s.db.ListWallets(algorithm, sort, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	// Add ETH balances
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	result := make([]map[string]interface{}, 0, len(wallets))
	for _, w := range wallets {
		entry := map[string]interface{}{
			"address":          w.Address,
			"algorithm":        algorithmBase(w.Algorithm),
			"publicKeyPrefix":  w.PublicKeyPrefix,
			"transactionCount": w.TransactionCount,
			"isMigrated7702":   w.IsMigrated7702,
			"createdAt":        w.CreatedAt,
		}

		bal, err := s.chain.BalanceAt(ctx, common.HexToAddress(w.Address))
		if err == nil {
			entry["ethBalance"] = bal.String()
		} else {
			entry["ethBalance"] = "0"
		}

		result = append(result, entry)
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleExplorerAddress(w http.ResponseWriter, r *http.Request) {
	address := r.PathValue("address")
	if address == "" {
		writeError(w, http.StatusBadRequest, "address required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	addr := common.HexToAddress(address)
	wallet, err := s.db.GetWallet(strings.ToLower(address))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	ethBal, _ := s.chain.BalanceAt(ctx, addr)
	if ethBal == nil {
		ethBal = big.NewInt(0)
	}

	if wallet == nil {
		// Not a PQ wallet
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"address":    address,
			"isPQWallet": false,
			"ethBalance": ethBal.String(),
		})
		return
	}

	// Get on-chain nonce
	nonce := uint64(0)
	nonceData, err := chain.WalletABI.Pack("nonce")
	if err == nil {
		result, err := s.chain.CallContract(ctx, addr, nonceData)
		if err == nil && len(result) >= 32 {
			nonce = new(big.Int).SetBytes(result).Uint64()
		}
	}

	// Get payer from chain
	payerStr := ""
	payerData, err := chain.WalletABI.Pack("payer")
	if err == nil {
		result, err := s.chain.CallContract(ctx, addr, payerData)
		if err == nil && len(result) >= 32 {
			payerStr = common.BytesToAddress(result).Hex()
		}
	}

	wethBal := s.getERC20Balance(ctx, common.HexToAddress(s.cfg.Deployments.WETH9), addr)
	usdBal := s.getERC20Balance(ctx, common.HexToAddress(s.cfg.Deployments.USD), addr)

	txs, _ := s.db.GetWalletTransactions(wallet.Address)
	txCount := len(txs)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"address":          wallet.Address,
		"isPQWallet":       true,
		"algorithm":        algorithmBase(wallet.Algorithm),
		"publicKey":        wallet.PublicKey,
		"nonce":            nonce,
		"payer":            payerStr,
		"isMigrated7702":   wallet.IsMigrated7702,
		"ethBalance":       ethBal.String(),
		"wethBalance":      wethBal.String(),
		"usdBalance":       usdBal.String(),
		"transactionCount": txCount,
		"createdAt":        wallet.CreatedAt,
		"creationTxHash":   wallet.TxHash,
	})
}

func algorithmToScheme(alg string) string {
	if strings.HasPrefix(alg, "falcon") {
		return "falcon"
	}
	if strings.HasPrefix(alg, "dilithium") {
		return "dilithium"
	}
	if strings.HasPrefix(alg, "ephemeral") {
		return "ephemeral-ecdsa"
	}
	return "ecdsa"
}

func algorithmToGas(alg string) int {
	switch {
	case alg == "falcon-direct":
		return 2800
	case alg == "dilithium-direct":
		return 119000
	case alg == "falcon-ntt":
		return 5000
	case alg == "dilithium-ntt":
		return 150000
	case alg == "ephemeral-ecdsa":
		return 3000 // ecrecover precompile
	default:
		return 0
	}
}

func algorithmToPrecompile(alg string) string {
	switch {
	case alg == "falcon-direct":
		return "0x0000000000000000000000000000000000000017"
	case alg == "dilithium-direct":
		return "0x000000000000000000000000000000000000001b"
	case strings.HasPrefix(alg, "falcon-ntt"):
		return "NTT verifier (composite)"
	case strings.HasPrefix(alg, "dilithium-ntt"):
		return "NTT verifier (composite)"
	case alg == "ephemeral-ecdsa":
		return "ecrecover (0x01) + key rotation"
	default:
		return ""
	}
}
