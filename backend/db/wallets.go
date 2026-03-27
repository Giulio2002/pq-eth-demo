package db

import (
	"database/sql"
	"time"
)

// Wallet represents a PQ smart wallet record.
type Wallet struct {
	Address       string `json:"address"`
	PublicKey     string `json:"publicKey"`
	Algorithm     string `json:"algorithm"`
	TxHash        string `json:"txHash"`
	IsMigrated7702 bool  `json:"isMigrated7702"`
	CreatedAt     string `json:"createdAt"`
}

// InsertWallet stores a new wallet.
func (db *DB) InsertWallet(w *Wallet) error {
	migrated := 0
	if w.IsMigrated7702 {
		migrated = 1
	}
	if w.CreatedAt == "" {
		w.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	_, err := db.conn.Exec(
		`INSERT OR REPLACE INTO wallets (address, public_key, algorithm, tx_hash, is_migrated_7702, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		w.Address, w.PublicKey, w.Algorithm, w.TxHash, migrated, w.CreatedAt,
	)
	return err
}

// GetWallet retrieves a wallet by address.
func (db *DB) GetWallet(address string) (*Wallet, error) {
	var w Wallet
	var migrated int
	err := db.conn.QueryRow(
		`SELECT address, public_key, algorithm, tx_hash, is_migrated_7702, created_at
		 FROM wallets WHERE address = ?`, address,
	).Scan(&w.Address, &w.PublicKey, &w.Algorithm, &w.TxHash, &migrated, &w.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	w.IsMigrated7702 = migrated != 0
	return &w, nil
}

// WalletStats holds aggregate wallet counts.
type WalletStats struct {
	Total          int
	Falcon         int
	Dilithium      int
	EphemeralECDSA int
}

// GetWalletStats returns aggregate wallet counts.
func (db *DB) GetWalletStats() (*WalletStats, error) {
	var stats WalletStats
	err := db.conn.QueryRow(`SELECT COUNT(*) FROM wallets`).Scan(&stats.Total)
	if err != nil {
		return nil, err
	}
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM wallets WHERE algorithm LIKE 'falcon%'`).Scan(&stats.Falcon)
	if err != nil {
		return nil, err
	}
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM wallets WHERE algorithm LIKE 'dilithium%'`).Scan(&stats.Dilithium)
	if err != nil {
		return nil, err
	}
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM wallets WHERE algorithm LIKE 'ephemeral%'`).Scan(&stats.EphemeralECDSA)
	if err != nil {
		return nil, err
	}
	return &stats, nil
}

// WalletListItem is used for the explorer wallet directory.
type WalletListItem struct {
	Address          string `json:"address"`
	Algorithm        string `json:"algorithm"`
	PublicKeyPrefix  string `json:"publicKeyPrefix"`
	TransactionCount int    `json:"transactionCount"`
	IsMigrated7702   bool   `json:"isMigrated7702"`
	CreatedAt        string `json:"createdAt"`
}

// ListWallets returns wallets for the explorer directory with optional filtering.
func (db *DB) ListWallets(algorithm string, sortBy string, limit, offset int) ([]WalletListItem, error) {
	query := `SELECT w.address, w.algorithm, w.public_key, w.is_migrated_7702, w.created_at,
	          (SELECT COUNT(*) FROM transactions t WHERE t.wallet_address = w.address) as tx_count
	          FROM wallets w`
	args := []interface{}{}

	if algorithm != "" {
		query += ` WHERE w.algorithm LIKE ?`
		args = append(args, algorithm+"%")
	}

	switch sortBy {
	case "transactions":
		query += ` ORDER BY tx_count DESC`
	case "oldest":
		query += ` ORDER BY w.created_at ASC`
	default:
		query += ` ORDER BY w.created_at DESC`
	}

	if limit <= 0 {
		limit = 50
	}
	query += ` LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var wallets []WalletListItem
	for rows.Next() {
		var w WalletListItem
		var pubKey string
		var migrated int
		if err := rows.Scan(&w.Address, &w.Algorithm, &pubKey, &migrated, &w.CreatedAt, &w.TransactionCount); err != nil {
			return nil, err
		}
		w.IsMigrated7702 = migrated != 0
		// Show first 10 hex chars as prefix
		if len(pubKey) > 12 {
			w.PublicKeyPrefix = pubKey[:12] + "..."
		} else {
			w.PublicKeyPrefix = pubKey
		}
		wallets = append(wallets, w)
	}
	if wallets == nil {
		wallets = []WalletListItem{}
	}
	return wallets, rows.Err()
}

// GetAllWallets returns all wallets (used by indexer).
func (db *DB) GetAllWallets() ([]Wallet, error) {
	rows, err := db.conn.Query(`SELECT address, public_key, algorithm, tx_hash, is_migrated_7702, created_at FROM wallets`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var wallets []Wallet
	for rows.Next() {
		var w Wallet
		var migrated int
		if err := rows.Scan(&w.Address, &w.PublicKey, &w.Algorithm, &w.TxHash, &migrated, &w.CreatedAt); err != nil {
			return nil, err
		}
		w.IsMigrated7702 = migrated != 0
		wallets = append(wallets, w)
	}
	return wallets, rows.Err()
}
