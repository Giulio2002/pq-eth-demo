package chain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"pq-eth-backend/config"
)

// Client wraps an Ethereum RPC client with payer account management.
type Client struct {
	eth        *ethclient.Client
	payerKey   *ecdsa.PrivateKey
	payerAddr  common.Address
	chainID    *big.Int
	cfg        *config.Config
	nonceMu    sync.Mutex
	nonce      uint64
	nonceReady bool
}

// NewClient creates a new Ethereum client connected to the RPC endpoint.
func NewClient(cfg *config.Config) (*Client, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	eth, err := ethclient.DialContext(ctx, cfg.ChainRPCURL)
	if err != nil {
		return nil, fmt.Errorf("connecting to chain: %w", err)
	}

	// Parse payer private key
	keyHex := strings.TrimPrefix(cfg.PayerPrivateKey, "0x")
	payerKey, err := crypto.HexToECDSA(keyHex)
	if err != nil {
		return nil, fmt.Errorf("parsing payer key: %w", err)
	}
	payerAddr := crypto.PubkeyToAddress(payerKey.PublicKey)

	chainID, err := eth.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("getting chain ID: %w", err)
	}

	return &Client{
		eth:       eth,
		payerKey:  payerKey,
		payerAddr: payerAddr,
		chainID:   chainID,
		cfg:       cfg,
	}, nil
}

// PayerAddress returns the payer account address.
func (c *Client) PayerAddress() common.Address {
	return c.payerAddr
}

// ChainID returns the chain ID.
func (c *Client) ChainID() *big.Int {
	return c.chainID
}

// BlockNumber returns the latest block number.
func (c *Client) BlockNumber(ctx context.Context) (uint64, error) {
	return c.eth.BlockNumber(ctx)
}

// BalanceAt returns the ETH balance of an address.
func (c *Client) BalanceAt(ctx context.Context, addr common.Address) (*big.Int, error) {
	return c.eth.BalanceAt(ctx, addr, nil)
}

// CallContract performs a read-only contract call.
func (c *Client) CallContract(ctx context.Context, to common.Address, data []byte) ([]byte, error) {
	msg := ethereum.CallMsg{
		To:   &to,
		Data: data,
	}
	return c.eth.CallContract(ctx, msg, nil)
}

// SendTransaction signs and sends a transaction from the payer account.
func (c *Client) SendTransaction(ctx context.Context, to common.Address, data []byte, value *big.Int) (*types.Transaction, error) {
	c.nonceMu.Lock()
	defer c.nonceMu.Unlock()

	if !c.nonceReady {
		nonce, err := c.eth.PendingNonceAt(ctx, c.payerAddr)
		if err != nil {
			return nil, fmt.Errorf("getting nonce: %w", err)
		}
		c.nonce = nonce
		c.nonceReady = true
	}

	gasPrice, err := c.eth.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("getting gas price: %w", err)
	}

	if value == nil {
		value = big.NewInt(0)
	}

	// Estimate gas
	msg := ethereum.CallMsg{
		From:  c.payerAddr,
		To:    &to,
		Data:  data,
		Value: value,
	}
	gasLimit, err := c.eth.EstimateGas(ctx, msg)
	if err != nil {
		return nil, fmt.Errorf("estimating gas: %w", err)
	}
	// Add 20% buffer
	gasLimit = gasLimit * 120 / 100

	tx := types.NewTx(&types.LegacyTx{
		Nonce:    c.nonce,
		To:       &to,
		Value:    value,
		Gas:      gasLimit,
		GasPrice: gasPrice,
		Data:     data,
	})

	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(c.chainID), c.payerKey)
	if err != nil {
		return nil, fmt.Errorf("signing tx: %w", err)
	}

	if err := c.eth.SendTransaction(ctx, signedTx); err != nil {
		// Reset nonce on error — it might be stale
		c.nonceReady = false
		return nil, fmt.Errorf("sending tx: %w", err)
	}

	c.nonce++
	return signedTx, nil
}

// SendETH sends a plain ETH transfer from the payer account.
func (c *Client) SendETH(ctx context.Context, to common.Address, amount *big.Int) (*types.Transaction, error) {
	return c.SendTransaction(ctx, to, nil, amount)
}

// WaitForReceipt polls for a transaction receipt.
func (c *Client) WaitForReceipt(ctx context.Context, txHash common.Hash) (*types.Receipt, error) {
	for {
		receipt, err := c.eth.TransactionReceipt(ctx, txHash)
		if err == nil {
			return receipt, nil
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}

// GetBlockByNumber returns a block by number.
func (c *Client) GetBlockByNumber(ctx context.Context, num *big.Int) (*types.Block, error) {
	return c.eth.BlockByNumber(ctx, num)
}

// FilterLogs queries historical logs.
func (c *Client) FilterLogs(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
	return c.eth.FilterLogs(ctx, q)
}

// TransactionReceipt returns the receipt for a transaction.
func (c *Client) TransactionReceipt(ctx context.Context, txHash common.Hash) (*types.Receipt, error) {
	return c.eth.TransactionReceipt(ctx, txHash)
}

// HeaderByNumber returns the block header.
func (c *Client) HeaderByNumber(ctx context.Context, num *big.Int) (*types.Header, error) {
	return c.eth.HeaderByNumber(ctx, num)
}
