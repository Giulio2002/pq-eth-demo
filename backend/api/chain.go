package api

import (
	"context"
	"net/http"
	"time"
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
	// Fixed rates — MockSwapper uses 1 ETH = 2000 USD, 1 JEDKH = 0.5 ETH
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"price":    "2000.00",
		"ethUsd":   2000.0,
		"jedkhEth": 0.5,
		"jedkhUsd": 1000.0,
	})
}
