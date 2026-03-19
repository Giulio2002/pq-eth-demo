package api

import (
	"encoding/json"
	"net/http"
)

type migrate7702Request struct {
	EOAAddress    string `json:"eoaAddress"`
	PublicKey     string `json:"publicKey"`
	Algorithm     string `json:"algorithm"`
	Authorization string `json:"authorization"`
}

func (s *Server) handleMigrate7702(w http.ResponseWriter, r *http.Request) {
	var req migrate7702Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.EOAAddress == "" || req.PublicKey == "" || req.Algorithm == "" || req.Authorization == "" {
		writeError(w, http.StatusBadRequest, "eoaAddress, publicKey, algorithm, and authorization are required")
		return
	}

	// EIP-7702 migration requires constructing a type 4 (0x04) transaction
	// go-ethereum 1.14.12 may not fully support 7702 natively
	// Return an informative error for now, as 7702 support depends on chain + client version
	writeError(w, http.StatusNotImplemented,
		"EIP-7702 migration is not yet supported in this version. "+
			"The chain and go-ethereum client must support type 4 (SetCode) transactions. "+
			"Please check for updates or use direct wallet creation via POST /api/wallet/create.")
}
