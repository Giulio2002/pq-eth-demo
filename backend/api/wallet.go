package api

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"pq-eth-backend/chain"
	"pq-eth-backend/db"
)

type createWalletRequest struct {
	PublicKey string `json:"publicKey"`
	Algorithm string `json:"algorithm"`
}

type createWalletResponse struct {
	WalletAddress string `json:"walletAddress"`
	TxHash        string `json:"txHash"`
	Algorithm     string `json:"algorithm"`
	PublicKeySize int    `json:"publicKeySize"`
}

func (s *Server) handleCreateWallet(w http.ResponseWriter, r *http.Request) {
	var req createWalletRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	// Map algorithm string to uint8
	algID, algBase, err := parseAlgorithm(req.Algorithm)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Validate public key
	pubKeyBytes, err := hexDecode(req.PublicKey)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid publicKey hex encoding")
		return
	}

	var expectedSize int
	switch algBase {
	case "falcon":
		expectedSize = 897
	case "dilithium":
		expectedSize = 1312
	case "ecdsa":
		expectedSize = 20 // ephemeral ECDSA: publicKey is the initial signer address
	}
	if len(pubKeyBytes) != expectedSize {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid public key size: got %d bytes, expected %d for %s", len(pubKeyBytes), expectedSize, algBase))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	// Compute verifyKey:
	// - Falcon (0,2): NTT-domain h via precompile 0x12 (1024 bytes)
	// - Dilithium (1,3): same as publicKey (1312 bytes)
	var verifyKeyBytes []byte
	switch algBase {
	case "falcon":
		verifyKeyBytes, err = s.chain.ComputeFalconVerifyKey(ctx, pubKeyBytes)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to compute falcon verify key: "+err.Error())
			return
		}
		log.Printf("computed falcon NTT verifyKey: %d bytes", len(verifyKeyBytes))
	case "ecdsa":
		verifyKeyBytes = []byte{} // ephemeral ECDSA: no verify key needed
	default:
		verifyKeyBytes = pubKeyBytes // Dilithium: verifyKey == publicKey
	}

	// Encode factory.createWallet(publicKey, verifyKey, algorithm, payer) calldata
	factoryAddr := common.HexToAddress(s.cfg.Deployments.PQWalletFactory)
	calldata, err := chain.FactoryABI.Pack("createWallet", pubKeyBytes, verifyKeyBytes, algID, s.chain.PayerAddress())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode calldata: "+err.Error())
		return
	}

	tx, err := s.chain.SendTransaction(ctx, factoryAddr, calldata, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to send transaction: "+err.Error())
		return
	}

	receipt, err := s.chain.WaitForReceipt(ctx, tx.Hash())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get receipt: "+err.Error())
		return
	}

	if receipt.Status == 0 {
		writeError(w, http.StatusInternalServerError, "wallet creation transaction reverted")
		return
	}

	// Parse WalletCreated event from logs
	var walletAddr common.Address
	walletCreatedTopic := chain.FactoryABI.Events["WalletCreated"].ID
	for _, vLog := range receipt.Logs {
		if len(vLog.Topics) > 0 && vLog.Topics[0] == walletCreatedTopic {
			walletAddr = common.HexToAddress(vLog.Topics[1].Hex())
			break
		}
	}

	if walletAddr == (common.Address{}) {
		writeError(w, http.StatusInternalServerError, "WalletCreated event not found in receipt")
		return
	}

	// Fund the new wallet with 1 ETH so the user can interact immediately
	oneETH := new(big.Int).Mul(big.NewInt(1), new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil))
	fundTx, err := s.chain.SendETH(ctx, walletAddr, oneETH)
	if err != nil {
		log.Printf("warning: failed to fund new wallet with 1 ETH: %v", err)
	} else {
		log.Printf("funded wallet %s with 1 ETH (tx: %s)", walletAddr.Hex(), fundTx.Hash().Hex())
	}

	// Store wallet in DB
	wallet := &db.Wallet{
		Address:   strings.ToLower(walletAddr.Hex()),
		PublicKey: req.PublicKey,
		Algorithm: req.Algorithm,
		TxHash:    tx.Hash().Hex(),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := s.db.InsertWallet(wallet); err != nil {
		log.Printf("error storing wallet: %v", err)
	}

	// Store deploy transaction
	blockNum := receipt.BlockNumber.Int64()
	dbTx := &db.Transaction{
		TxHash:        tx.Hash().Hex(),
		WalletAddress: wallet.Address,
		ToAddress:     strings.ToLower(factoryAddr.Hex()),
		Value:         "0x0",
		Status:        "success",
		BlockNumber:   &blockNum,
		Timestamp:     wallet.CreatedAt,
		Type:          "deploy",
	}
	if err := s.db.InsertTransaction(dbTx); err != nil {
		log.Printf("error storing deploy tx: %v", err)
	}

	writeJSON(w, http.StatusOK, createWalletResponse{
		WalletAddress: walletAddr.Hex(),
		TxHash:        tx.Hash().Hex(),
		Algorithm:     algBase,
		PublicKeySize: expectedSize,
	})
}

func (s *Server) handleGetWallet(w http.ResponseWriter, r *http.Request) {
	address := r.PathValue("address")
	if address == "" {
		writeError(w, http.StatusBadRequest, "address required")
		return
	}

	wallet, err := s.db.GetWallet(strings.ToLower(address))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}
	if wallet == nil {
		writeError(w, http.StatusNotFound, "wallet not found")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	addr := common.HexToAddress(address)

	// Get nonce from chain
	nonce := uint64(0)
	nonceData, err := chain.WalletABI.Pack("nonce")
	if err == nil {
		result, err := s.chain.CallContract(ctx, addr, nonceData)
		if err == nil && len(result) >= 32 {
			nonce = new(big.Int).SetBytes(result).Uint64()
		}
	}

	// Get ETH balance
	balance, err := s.chain.BalanceAt(ctx, addr)
	if err != nil {
		balance = big.NewInt(0)
	}

	// Determine base algorithm name for response
	algBase := algorithmBase(wallet.Algorithm)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"address":        wallet.Address,
		"publicKey":      wallet.PublicKey,
		"algorithm":      algBase,
		"nonce":          nonce,
		"ethBalance":     balance.String(),
		"createdAt":      wallet.CreatedAt,
		"isMigrated7702": wallet.IsMigrated7702,
	})
}

func (s *Server) handleWalletAssets(w http.ResponseWriter, r *http.Request) {
	address := r.PathValue("address")
	if address == "" {
		writeError(w, http.StatusBadRequest, "address required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	addr := common.HexToAddress(address)

	// ETH balance
	ethBal, err := s.chain.BalanceAt(ctx, addr)
	if err != nil {
		ethBal = big.NewInt(0)
	}

	// WETH balance
	wethBal := s.getERC20Balance(ctx, common.HexToAddress(s.cfg.Deployments.WETH9), addr)

	// USD balance
	usdBal := s.getERC20Balance(ctx, common.HexToAddress(s.cfg.Deployments.USD), addr)

	writeJSON(w, http.StatusOK, map[string]string{
		"eth":  ethBal.String(),
		"weth": wethBal.String(),
		"usd":  usdBal.String(),
	})
}

func (s *Server) handleWalletTransactions(w http.ResponseWriter, r *http.Request) {
	address := r.PathValue("address")
	if address == "" {
		writeError(w, http.StatusBadRequest, "address required")
		return
	}

	txs, err := s.db.GetWalletTransactions(strings.ToLower(address))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, txs)
}

func (s *Server) getERC20Balance(ctx context.Context, token, account common.Address) *big.Int {
	data, err := chain.ERC20ABI.Pack("balanceOf", account)
	if err != nil {
		return big.NewInt(0)
	}
	result, err := s.chain.CallContract(ctx, token, data)
	if err != nil || len(result) < 32 {
		return big.NewInt(0)
	}
	return new(big.Int).SetBytes(result)
}

// parseAlgorithm maps algorithm string to (uint8 id, base name).
func parseAlgorithm(alg string) (uint8, string, error) {
	switch alg {
	case "falcon-direct", "falcon":
		return 0, "falcon", nil
	case "dilithium-direct", "dilithium":
		return 1, "dilithium", nil
	case "falcon-ntt":
		return 2, "falcon", nil
	case "dilithium-ntt":
		return 3, "dilithium", nil
	case "ephemeral-ecdsa":
		return 4, "ecdsa", nil
	default:
		return 0, "", fmt.Errorf("unknown algorithm: %s (expected: falcon-direct, dilithium-direct, falcon-ntt, dilithium-ntt, ephemeral-ecdsa)", alg)
	}
}

// algorithmBase returns the base algorithm name (falcon or dilithium).
func algorithmBase(alg string) string {
	if strings.HasPrefix(alg, "falcon") {
		return "falcon"
	}
	if strings.HasPrefix(alg, "dilithium") {
		return "dilithium"
	}
	if strings.HasPrefix(alg, "ephemeral") {
		return "ephemeral-ecdsa"
	}
	return alg
}

func hexDecode(s string) ([]byte, error) {
	s = strings.TrimPrefix(s, "0x")
	return hex.DecodeString(s)
}
