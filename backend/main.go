package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "modernc.org/sqlite"

	"pq-eth-backend/api"
	"pq-eth-backend/chain"
	"pq-eth-backend/config"
	"pq-eth-backend/db"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting PQ Smart Wallet Backend...")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Chain RPC: %s", cfg.ChainRPCURL)
	log.Printf("Listening on port: %s", cfg.BackendPort)

	// Open database
	database, err := db.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer database.Close()
	log.Println("Database opened successfully")

	// Connect to chain (retry up to 30 seconds)
	var chainClient *chain.Client
	for i := 0; i < 15; i++ {
		chainClient, err = chain.NewClient(cfg)
		if err == nil {
			break
		}
		log.Printf("Chain connection attempt %d failed: %v", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Failed to connect to chain after retries: %v", err)
	}
	log.Printf("Connected to chain ID: %s, payer: %s", chainClient.ChainID().String(), chainClient.PayerAddress().Hex())

	// Start chain indexer
	indexer := chain.NewIndexer(chainClient, database, cfg)
	indexer.Start()
	log.Println("Chain indexer started")

	// Create API server
	server := api.NewServer(cfg, database, chainClient)

	httpServer := &http.Server{
		Addr:         ":" + cfg.BackendPort,
		Handler:      server.Handler(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start HTTP server in goroutine
	go func() {
		log.Printf("HTTP server listening on :%s", cfg.BackendPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("Shutdown signal received...")

	// Stop indexer
	indexer.Stop()
	log.Println("Indexer stopped")

	// Shutdown HTTP server
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}
	log.Println("HTTP server stopped")

	// Close database
	database.Close()
	log.Println("Database closed. Goodbye!")
}
