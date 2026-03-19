package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"pq-eth-backend/chain"
	"pq-eth-backend/config"
	"pq-eth-backend/db"
)

// Server is the HTTP API server.
type Server struct {
	cfg    *config.Config
	db     *db.DB
	chain  *chain.Client
	mux    *http.ServeMux
}

// NewServer creates a new API server.
func NewServer(cfg *config.Config, database *db.DB, chainClient *chain.Client) *Server {
	s := &Server{
		cfg:   cfg,
		db:    database,
		chain: chainClient,
		mux:   http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

// Handler returns the HTTP handler with CORS middleware.
func (s *Server) Handler() http.Handler {
	return s.corsMiddleware(s.mux)
}

func (s *Server) registerRoutes() {
	// Health
	s.mux.HandleFunc("GET /health", s.handleHealth)

	// Wallet management
	s.mux.HandleFunc("POST /api/wallet/create", s.handleCreateWallet)
	s.mux.HandleFunc("GET /api/wallet/{address}/assets", s.handleWalletAssets)
	s.mux.HandleFunc("GET /api/wallet/{address}/transactions", s.handleWalletTransactions)
	s.mux.HandleFunc("GET /api/wallet/{address}", s.handleGetWallet)

	// Transaction relay
	s.mux.HandleFunc("POST /api/wallet/execute", s.handleExecute)
	s.mux.HandleFunc("POST /api/wallet/execute-batch", s.handleExecuteBatch)
	s.mux.HandleFunc("POST /api/wallet/swap", s.handleSwap)

	// Message hash helpers
	s.mux.HandleFunc("POST /api/wallet/execute-message", s.handleExecuteMessage)
	s.mux.HandleFunc("POST /api/wallet/swap-message", s.handleSwapMessage)

	// EIP-7702 migration
	s.mux.HandleFunc("POST /api/wallet/migrate-7702", s.handleMigrate7702)

	// Chain info
	s.mux.HandleFunc("GET /api/chain/block", s.handleChainBlock)
	s.mux.HandleFunc("GET /api/chain/pool-price", s.handlePoolPrice)

	// Explorer
	s.mux.HandleFunc("GET /api/explorer/stats", s.handleExplorerStats)
	s.mux.HandleFunc("GET /api/explorer/recent-transactions", s.handleRecentTransactions)
	s.mux.HandleFunc("GET /api/explorer/recent-blocks", s.handleRecentBlocks)
	s.mux.HandleFunc("GET /api/explorer/tx/{hash}", s.handleExplorerTx)
	s.mux.HandleFunc("GET /api/explorer/wallets", s.handleExplorerWallets)
	s.mux.HandleFunc("GET /api/explorer/address/{address}", s.handleExplorerAddress)
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		for _, allowed := range s.cfg.AllowedOrigins {
			if strings.TrimSpace(allowed) == origin {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				break
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("error encoding JSON response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
// already exists, just checking
