package api

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"pq-eth-backend/chain"
)

type executeMessageRequest struct {
	Wallet     string `json:"wallet"`
	To         string `json:"to"`
	Value      string `json:"value"`
	Data       string `json:"data"`
	NextSigner string `json:"nextSigner,omitempty"` // ephemeral ECDSA: next signer address
}

type swapMessageRequest struct {
	Wallet       string `json:"wallet"`
	Direction    string `json:"direction"`
	AmountIn     string `json:"amountIn"`
	MinAmountOut string `json:"minAmountOut"`
	NextSigner   string `json:"nextSigner,omitempty"` // ephemeral ECDSA: next signer address
}

type messageResponse struct {
	MessageHash string `json:"messageHash"`
	Nonce       uint64 `json:"nonce"`
	ChainID     int64  `json:"chainId"`
}

func (s *Server) handleExecuteMessage(w http.ResponseWriter, r *http.Request) {
	var req executeMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Wallet == "" || req.To == "" {
		writeError(w, http.StatusBadRequest, "wallet and to are required")
		return
	}

	wallet, err := s.db.GetWallet(strings.ToLower(req.Wallet))
	if err != nil || wallet == nil {
		writeError(w, http.StatusNotFound, "wallet not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	nonce, err := s.getWalletNonce(ctx, common.HexToAddress(req.Wallet))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get nonce: "+err.Error())
		return
	}

	to := common.HexToAddress(req.To)
	value := new(big.Int)
	if req.Value != "" && req.Value != "0x0" && req.Value != "0x" {
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

	chainID := s.chain.ChainID()

	var msgHash []byte
	if req.NextSigner != "" {
		// Ephemeral ECDSA: hash includes nextSigner
		nextSigner := common.HexToAddress(req.NextSigner)
		msgHash = computeEphemeralExecuteMessageHash(to, value, dataBytes, nonce, chainID, nextSigner)
	} else {
		msgHash = computeExecuteMessageHash(to, value, dataBytes, nonce, chainID)
	}

	writeJSON(w, http.StatusOK, messageResponse{
		MessageHash: "0x" + common.Bytes2Hex(msgHash),
		Nonce:       nonce,
		ChainID:     chainID.Int64(),
	})
}

func (s *Server) handleSwapMessage(w http.ResponseWriter, r *http.Request) {
	var req swapMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Wallet == "" || req.Direction == "" || req.AmountIn == "" {
		writeError(w, http.StatusBadRequest, "wallet, direction, and amountIn are required")
		return
	}

	wallet, err := s.db.GetWallet(strings.ToLower(req.Wallet))
	if err != nil || wallet == nil {
		writeError(w, http.StatusNotFound, "wallet not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	nonce, err := s.getWalletNonce(ctx, common.HexToAddress(req.Wallet))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get nonce: "+err.Error())
		return
	}

	amountIn := new(big.Int)
	amountIn.SetString(req.AmountIn, 10)

	minAmountOut := new(big.Int)
	if req.MinAmountOut != "" {
		minAmountOut.SetString(req.MinAmountOut, 10)
	}

	targets, values, datas, err := s.buildSwapBatch(req.Direction, common.HexToAddress(req.Wallet), amountIn, minAmountOut)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build swap batch: "+err.Error())
		return
	}

	chainID := s.chain.ChainID()

	var msgHash []byte
	if req.NextSigner != "" {
		nextSigner := common.HexToAddress(req.NextSigner)
		msgHash = computeEphemeralBatchMessageHash(targets, values, datas, nonce, chainID, nextSigner)
	} else {
		msgHash = computeBatchMessageHash(targets, values, datas, nonce, chainID)
	}

	writeJSON(w, http.StatusOK, messageResponse{
		MessageHash: "0x" + common.Bytes2Hex(msgHash),
		Nonce:       nonce,
		ChainID:     chainID.Int64(),
	})
}

func (s *Server) getWalletNonce(ctx context.Context, walletAddr common.Address) (uint64, error) {
	nonceData, err := chain.WalletABI.Pack("nonce")
	if err != nil {
		return 0, fmt.Errorf("encoding nonce call: %w", err)
	}
	result, err := s.chain.CallContract(ctx, walletAddr, nonceData)
	if err != nil {
		return 0, fmt.Errorf("calling nonce: %w", err)
	}
	if len(result) < 32 {
		return 0, fmt.Errorf("invalid nonce response")
	}
	return new(big.Int).SetBytes(result).Uint64(), nil
}

// computeExecuteMessageHash computes keccak256(abi.encodePacked(to, value, data, nonce, chainId))
func computeExecuteMessageHash(to common.Address, value *big.Int, data []byte, nonce uint64, chainID *big.Int) []byte {
	packed := make([]byte, 0, 20+32+len(data)+32+32)
	packed = append(packed, to.Bytes()...)
	packed = append(packed, common.LeftPadBytes(value.Bytes(), 32)...)
	packed = append(packed, data...)
	packed = append(packed, common.LeftPadBytes(new(big.Int).SetUint64(nonce).Bytes(), 32)...)
	packed = append(packed, common.LeftPadBytes(chainID.Bytes(), 32)...)
	return crypto.Keccak256(packed)
}

// computeBatchMessageHash computes keccak256(abi.encode(targets, values, datas, nonce, chainId))
func computeBatchMessageHash(targets []common.Address, values []*big.Int, datas [][]byte, nonce uint64, chainID *big.Int) []byte {
	addressArrayTy, _ := abi.NewType("address[]", "", nil)
	uint256ArrayTy, _ := abi.NewType("uint256[]", "", nil)
	bytesArrayTy, _ := abi.NewType("bytes[]", "", nil)
	uint256Ty, _ := abi.NewType("uint256", "", nil)

	args := abi.Arguments{
		{Type: addressArrayTy},
		{Type: uint256ArrayTy},
		{Type: bytesArrayTy},
		{Type: uint256Ty},
		{Type: uint256Ty},
	}

	encoded, err := args.Pack(targets, values, datas, new(big.Int).SetUint64(nonce), chainID)
	if err != nil {
		// This shouldn't happen with valid inputs
		return crypto.Keccak256([]byte("error"))
	}

	return crypto.Keccak256(encoded)
}

// computeEphemeralExecuteMessageHash adds nextSigner to the hash for ephemeral ECDSA wallets.
// keccak256(abi.encodePacked(to, value, data, nonce, chainId, nextSigner))
func computeEphemeralExecuteMessageHash(to common.Address, value *big.Int, data []byte, nonce uint64, chainID *big.Int, nextSigner common.Address) []byte {
	packed := make([]byte, 0, 20+32+len(data)+32+32+20)
	packed = append(packed, to.Bytes()...)
	packed = append(packed, common.LeftPadBytes(value.Bytes(), 32)...)
	packed = append(packed, data...)
	packed = append(packed, common.LeftPadBytes(new(big.Int).SetUint64(nonce).Bytes(), 32)...)
	packed = append(packed, common.LeftPadBytes(chainID.Bytes(), 32)...)
	packed = append(packed, nextSigner.Bytes()...)
	return crypto.Keccak256(packed)
}

// computeEphemeralBatchMessageHash adds nextSigner to the batch hash for ephemeral ECDSA wallets.
// keccak256(abi.encode(targets, values, datas, nonce, chainId, nextSigner))
func computeEphemeralBatchMessageHash(targets []common.Address, values []*big.Int, datas [][]byte, nonce uint64, chainID *big.Int, nextSigner common.Address) []byte {
	addressArrayTy, _ := abi.NewType("address[]", "", nil)
	uint256ArrayTy, _ := abi.NewType("uint256[]", "", nil)
	bytesArrayTy, _ := abi.NewType("bytes[]", "", nil)
	uint256Ty, _ := abi.NewType("uint256", "", nil)
	addressTy, _ := abi.NewType("address", "", nil)

	args := abi.Arguments{
		{Type: addressArrayTy},
		{Type: uint256ArrayTy},
		{Type: bytesArrayTy},
		{Type: uint256Ty},
		{Type: uint256Ty},
		{Type: addressTy},
	}

	encoded, err := args.Pack(targets, values, datas, new(big.Int).SetUint64(nonce), chainID, nextSigner)
	if err != nil {
		return crypto.Keccak256([]byte("error"))
	}

	return crypto.Keccak256(encoded)
}
