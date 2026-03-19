package db

import (
	"database/sql"
)

// Transaction represents a relayed transaction record.
type Transaction struct {
	TxHash        string `json:"txHash"`
	WalletAddress string `json:"walletAddress"`
	ToAddress     string `json:"to"`
	Value         string `json:"value"`
	Data          string `json:"data,omitempty"`
	Status        string `json:"status"`
	BlockNumber   *int64 `json:"blockNumber,omitempty"`
	Timestamp     string `json:"timestamp,omitempty"`
	Type          string `json:"type"`
}

// InsertTransaction stores a new transaction.
func (db *DB) InsertTransaction(tx *Transaction) error {
	_, err := db.conn.Exec(
		`INSERT OR REPLACE INTO transactions (tx_hash, wallet_address, to_address, value, data, status, block_number, timestamp, type)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		tx.TxHash, tx.WalletAddress, tx.ToAddress, tx.Value, tx.Data, tx.Status, tx.BlockNumber, tx.Timestamp, tx.Type,
	)
	return err
}

// GetTransaction retrieves a transaction by hash.
func (db *DB) GetTransaction(txHash string) (*Transaction, error) {
	var tx Transaction
	var blockNum sql.NullInt64
	var timestamp sql.NullString
	var data sql.NullString

	err := db.conn.QueryRow(
		`SELECT tx_hash, wallet_address, to_address, value, data, status, block_number, timestamp, type
		 FROM transactions WHERE tx_hash = ?`, txHash,
	).Scan(&tx.TxHash, &tx.WalletAddress, &tx.ToAddress, &tx.Value, &data, &tx.Status, &blockNum, &timestamp, &tx.Type)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if blockNum.Valid {
		tx.BlockNumber = &blockNum.Int64
	}
	if timestamp.Valid {
		tx.Timestamp = timestamp.String
	}
	if data.Valid {
		tx.Data = data.String
	}
	return &tx, nil
}

// GetWalletTransactions returns transactions for a wallet.
func (db *DB) GetWalletTransactions(walletAddress string) ([]Transaction, error) {
	rows, err := db.conn.Query(
		`SELECT tx_hash, wallet_address, to_address, value, data, status, block_number, timestamp, type
		 FROM transactions WHERE wallet_address = ? ORDER BY COALESCE(block_number, 999999999) DESC, timestamp DESC`,
		walletAddress,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []Transaction
	for rows.Next() {
		var tx Transaction
		var blockNum sql.NullInt64
		var timestamp sql.NullString
		var data sql.NullString
		if err := rows.Scan(&tx.TxHash, &tx.WalletAddress, &tx.ToAddress, &tx.Value, &data, &tx.Status, &blockNum, &timestamp, &tx.Type); err != nil {
			return nil, err
		}
		if blockNum.Valid {
			tx.BlockNumber = &blockNum.Int64
		}
		if timestamp.Valid {
			tx.Timestamp = timestamp.String
		}
		if data.Valid {
			tx.Data = data.String
		}
		txs = append(txs, tx)
	}
	if txs == nil {
		txs = []Transaction{}
	}
	return txs, rows.Err()
}

// TransactionStats holds aggregate transaction counts.
type TransactionStats struct {
	Total     int
	Falcon    int
	Dilithium int
}

// GetTransactionStats returns aggregate transaction counts joined with wallet algorithm.
func (db *DB) GetTransactionStats() (*TransactionStats, error) {
	var stats TransactionStats
	err := db.conn.QueryRow(`SELECT COUNT(*) FROM transactions`).Scan(&stats.Total)
	if err != nil {
		return nil, err
	}
	err = db.conn.QueryRow(
		`SELECT COUNT(*) FROM transactions t
		 JOIN wallets w ON t.wallet_address = w.address
		 WHERE w.algorithm LIKE 'falcon%'`,
	).Scan(&stats.Falcon)
	if err != nil {
		return nil, err
	}
	err = db.conn.QueryRow(
		`SELECT COUNT(*) FROM transactions t
		 JOIN wallets w ON t.wallet_address = w.address
		 WHERE w.algorithm LIKE 'dilithium%'`,
	).Scan(&stats.Dilithium)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

// RecentTransaction includes wallet algorithm info for explorer.
type RecentTransaction struct {
	TxHash        string `json:"txHash"`
	WalletAddress string `json:"walletAddress"`
	ToAddress     string `json:"to"`
	Value         string `json:"value"`
	Status        string `json:"status"`
	BlockNumber   *int64 `json:"blockNumber,omitempty"`
	Timestamp     string `json:"timestamp,omitempty"`
	Type          string `json:"type"`
	Algorithm     string `json:"algorithm"`
}

// GetRecentTransactions returns recent transactions with wallet algorithm info.
func (db *DB) GetRecentTransactions(limit int) ([]RecentTransaction, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := db.conn.Query(
		`SELECT t.tx_hash, t.wallet_address, t.to_address, t.value, t.status, t.block_number, t.timestamp, t.type, w.algorithm
		 FROM transactions t
		 JOIN wallets w ON t.wallet_address = w.address
		 ORDER BY COALESCE(t.block_number, 999999999) DESC, t.timestamp DESC
		 LIMIT ?`, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []RecentTransaction
	for rows.Next() {
		var tx RecentTransaction
		var blockNum sql.NullInt64
		var timestamp sql.NullString
		if err := rows.Scan(&tx.TxHash, &tx.WalletAddress, &tx.ToAddress, &tx.Value, &tx.Status, &blockNum, &timestamp, &tx.Type, &tx.Algorithm); err != nil {
			return nil, err
		}
		if blockNum.Valid {
			tx.BlockNumber = &blockNum.Int64
		}
		if timestamp.Valid {
			tx.Timestamp = timestamp.String
		}
		txs = append(txs, tx)
	}
	if txs == nil {
		txs = []RecentTransaction{}
	}
	return txs, rows.Err()
}

// GetPendingTransactions returns all pending transactions (for indexer status updates).
func (db *DB) GetPendingTransactions() ([]Transaction, error) {
	rows, err := db.conn.Query(
		`SELECT tx_hash, wallet_address, to_address, value, data, status, block_number, timestamp, type
		 FROM transactions WHERE status = 'pending'`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txs []Transaction
	for rows.Next() {
		var tx Transaction
		var blockNum sql.NullInt64
		var timestamp sql.NullString
		var data sql.NullString
		if err := rows.Scan(&tx.TxHash, &tx.WalletAddress, &tx.ToAddress, &tx.Value, &data, &tx.Status, &blockNum, &timestamp, &tx.Type); err != nil {
			return nil, err
		}
		if blockNum.Valid {
			tx.BlockNumber = &blockNum.Int64
		}
		if timestamp.Valid {
			tx.Timestamp = timestamp.String
		}
		if data.Valid {
			tx.Data = data.String
		}
		txs = append(txs, tx)
	}
	return txs, rows.Err()
}

// UpdateTransactionStatus updates a transaction's status and block info.
func (db *DB) UpdateTransactionStatus(txHash, status string, blockNumber int64, timestamp string) error {
	_, err := db.conn.Exec(
		`UPDATE transactions SET status = ?, block_number = ?, timestamp = ? WHERE tx_hash = ?`,
		status, blockNumber, timestamp, txHash,
	)
	return err
}

// GetLastIndexedBlock returns the highest indexed block number.
func (db *DB) GetLastIndexedBlock() (int64, error) {
	var blockNum sql.NullInt64
	err := db.conn.QueryRow(`SELECT MAX(block_number) FROM indexed_blocks`).Scan(&blockNum)
	if err != nil {
		return 0, err
	}
	if blockNum.Valid {
		return blockNum.Int64, nil
	}
	return 0, nil
}

// InsertIndexedBlock records that a block has been indexed.
func (db *DB) InsertIndexedBlock(blockNumber int64, blockHash string, indexedAt string) error {
	_, err := db.conn.Exec(
		`INSERT OR IGNORE INTO indexed_blocks (block_number, block_hash, indexed_at) VALUES (?, ?, ?)`,
		blockNumber, blockHash, indexedAt,
	)
	return err
}
