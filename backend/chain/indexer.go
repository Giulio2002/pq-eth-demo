package chain

import (
	"context"
	"log"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"

	"pq-eth-backend/config"
	"pq-eth-backend/db"
)

// Indexer polls the chain for new blocks and indexes wallet events.
type Indexer struct {
	client  *Client
	db      *db.DB
	cfg     *config.Config
	factory common.Address
	stopCh  chan struct{}
	doneCh  chan struct{}
}

// NewIndexer creates a new chain indexer.
func NewIndexer(client *Client, database *db.DB, cfg *config.Config) *Indexer {
	return &Indexer{
		client:  client,
		db:      database,
		cfg:     cfg,
		factory: common.HexToAddress(cfg.Deployments.PQWalletFactory),
		stopCh:  make(chan struct{}),
		doneCh:  make(chan struct{}),
	}
}

// Start begins the indexer loop in a goroutine.
func (idx *Indexer) Start() {
	go idx.run()
}

// Stop signals the indexer to stop and waits for it to finish.
func (idx *Indexer) Stop() {
	close(idx.stopCh)
	<-idx.doneCh
}

func (idx *Indexer) run() {
	defer close(idx.doneCh)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-idx.stopCh:
			return
		case <-ticker.C:
			idx.poll()
		}
	}
}

func (idx *Indexer) poll() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Get latest block
	latestBlock, err := idx.client.BlockNumber(ctx)
	if err != nil {
		log.Printf("[indexer] error getting block number: %v", err)
		return
	}

	// Get last indexed block
	lastIndexed, err := idx.db.GetLastIndexedBlock()
	if err != nil {
		log.Printf("[indexer] error getting last indexed block: %v", err)
		return
	}

	// If we're caught up, just update pending txs
	if uint64(lastIndexed) >= latestBlock {
		idx.updatePendingTransactions(ctx)
		return
	}

	// Index new blocks
	from := lastIndexed + 1
	to := int64(latestBlock)

	// Process in chunks of 100 blocks
	for from <= to {
		chunkEnd := from + 99
		if chunkEnd > to {
			chunkEnd = to
		}

		idx.indexRange(ctx, from, chunkEnd)
		from = chunkEnd + 1
	}

	// Update pending transactions
	idx.updatePendingTransactions(ctx)
}

func (idx *Indexer) indexRange(ctx context.Context, from, to int64) {
	// Look for WalletCreated events from factory
	walletCreatedTopic := FactoryABI.Events["WalletCreated"].ID

	query := ethereum.FilterQuery{
		FromBlock: big.NewInt(from),
		ToBlock:   big.NewInt(to),
		Addresses: []common.Address{idx.factory},
		Topics:    [][]common.Hash{{walletCreatedTopic}},
	}

	logs, err := idx.client.FilterLogs(ctx, query)
	if err != nil {
		log.Printf("[indexer] error filtering logs %d-%d: %v", from, to, err)
		return
	}

	for _, vLog := range logs {
		idx.processWalletCreatedLog(ctx, vLog)
	}

	// Mark blocks as indexed
	for i := from; i <= to; i++ {
		_ = idx.db.InsertIndexedBlock(i, "", time.Now().UTC().Format(time.RFC3339))
	}
}

func (idx *Indexer) processWalletCreatedLog(ctx context.Context, vLog interface{}) {
	// The WalletCreated event has indexed wallet and owner, plus algorithm as data
	// We just check if the wallet is already in our DB
	// If not, we could add it, but we need the public key which is only in the initialize call
	// For now, we'll skip wallets created outside the backend
}

func (idx *Indexer) updatePendingTransactions(ctx context.Context) {
	pending, err := idx.db.GetPendingTransactions()
	if err != nil {
		log.Printf("[indexer] error getting pending txs: %v", err)
		return
	}

	for _, tx := range pending {
		receipt, err := idx.client.TransactionReceipt(ctx, common.HexToHash(tx.TxHash))
		if err != nil {
			continue // Not mined yet
		}

		status := "success"
		if receipt.Status == 0 {
			status = "failed"
		}

		header, err := idx.client.HeaderByNumber(ctx, big.NewInt(int64(receipt.BlockNumber.Uint64())))
		var ts string
		if err == nil {
			ts = time.Unix(int64(header.Time), 0).UTC().Format(time.RFC3339)
		} else {
			ts = time.Now().UTC().Format(time.RFC3339)
		}

		if err := idx.db.UpdateTransactionStatus(tx.TxHash, status, receipt.BlockNumber.Int64(), ts); err != nil {
			log.Printf("[indexer] error updating tx %s: %v", tx.TxHash, err)
		}
	}
}
