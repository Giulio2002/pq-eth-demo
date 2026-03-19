package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// DB wraps a SQLite database connection.
type DB struct {
	conn *sql.DB
}

// Open creates or opens the SQLite database and runs schema migrations.
func Open(dbPath string) (*DB, error) {
	// Ensure parent directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("creating db directory: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("opening database: %w", err)
	}

	// Enable WAL mode for better concurrent reads
	if _, err := conn.Exec("PRAGMA journal_mode=WAL"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("setting WAL mode: %w", err)
	}

	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("running migrations: %w", err)
	}

	return db, nil
}

// Close closes the database connection.
func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS wallets (
		address TEXT PRIMARY KEY,
		public_key TEXT NOT NULL,
		algorithm TEXT NOT NULL,
		tx_hash TEXT NOT NULL,
		is_migrated_7702 INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS transactions (
		tx_hash TEXT PRIMARY KEY,
		wallet_address TEXT NOT NULL REFERENCES wallets(address),
		to_address TEXT NOT NULL,
		value TEXT NOT NULL,
		data TEXT,
		status TEXT NOT NULL,
		block_number INTEGER,
		timestamp TEXT,
		type TEXT NOT NULL DEFAULT 'execute'
	);

	CREATE TABLE IF NOT EXISTS indexed_blocks (
		block_number INTEGER PRIMARY KEY,
		block_hash TEXT NOT NULL,
		indexed_at TEXT NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_address);
	CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_number);
	CREATE INDEX IF NOT EXISTS idx_wallets_algorithm ON wallets(algorithm);
	`
	_, err := db.conn.Exec(schema)
	return err
}
