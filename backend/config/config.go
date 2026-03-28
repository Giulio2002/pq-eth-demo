package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Deployments holds contract addresses from deployments.json.
type Deployments struct {
	ChainID                      int64  `json:"chainId"`
	PQWalletFactory              string `json:"PQWalletFactory"`
	FalconVerifierNTT            string `json:"FalconVerifierNTT"`
	DilithiumVerifierNTT         string `json:"DilithiumVerifierNTT"`
	WETH9                        string `json:"WETH9"`
	USD                          string `json:"USD"`
	UniswapV3Factory             string `json:"UniswapV3Factory"`
	SwapRouter                   string `json:"SwapRouter"`
	NonfungiblePositionManager   string `json:"NonfungiblePositionManager"`
	QuoterV2                     string `json:"QuoterV2"`
	ETHUSDPool                   string `json:"ETH_USD_Pool"`
	MockSwapper                  string `json:"MockSwapper"`
	JEDKH                        string `json:"JEDKH"`
	PayerAddress                 string `json:"payerAddress"`
}

// Config holds all backend configuration.
type Config struct {
	ChainRPCURL     string
	BackendPort     string
	PayerPrivateKey string
	DeploymentsFile string
	DBPath          string
	AllowedOrigins  []string
	Deployments     Deployments
}

// Load reads configuration from environment variables and files.
func Load() (*Config, error) {
	cfg := &Config{
		ChainRPCURL:     os.Getenv("CHAIN_RPC_URL"),
		BackendPort:     envOrDefault("BACKEND_PORT", "8546"),
		PayerPrivateKey: envOrDefault("PAYER_PRIVATE_KEY", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"),
		DeploymentsFile: envOrDefault("DEPLOYMENTS_FILE", "../deployments.json"),
		DBPath:          envOrDefault("DB_PATH", "./data/backend.db"),
	}

	originsStr := envOrDefault("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")
	cfg.AllowedOrigins = strings.Split(originsStr, ",")

	// If CHAIN_RPC_URL not set, try reading from ../chain/rpc_url.txt
	if cfg.ChainRPCURL == "" {
		rpcFile := filepath.Join("..", "chain", "rpc_url.txt")
		data, err := os.ReadFile(rpcFile)
		if err == nil {
			cfg.ChainRPCURL = strings.TrimSpace(string(data))
		} else {
			cfg.ChainRPCURL = "http://localhost:8545"
		}
	}

	// Load deployments.json
	if err := cfg.loadDeployments(); err != nil {
		return nil, fmt.Errorf("loading deployments: %w", err)
	}

	return cfg, nil
}

func (c *Config) loadDeployments() error {
	data, err := os.ReadFile(c.DeploymentsFile)
	if err != nil {
		return fmt.Errorf("reading %s: %w", c.DeploymentsFile, err)
	}
	if err := json.Unmarshal(data, &c.Deployments); err != nil {
		return fmt.Errorf("parsing %s: %w", c.DeploymentsFile, err)
	}
	return nil
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
