package chain

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"pq-eth-backend/config"
)

var _ = strings.TrimSpace

func TestComputeNTTForward(t *testing.T) {
	data, err := os.ReadFile("/tmp/test_vectors.json")
	if err != nil {
		t.Skip("No test vectors")
	}
	var vectors struct {
		PkHex      string `json:"pk_hex"`
		NtthFirst10 []int `json:"ntth_first10"`
	}
	json.Unmarshal(data, &vectors)

	pk, _ := hex.DecodeString(vectors.PkHex)
	h, _ := DecodeFalconPK(pk)

	rpcURL := ""
	rpcData, err := os.ReadFile("/Users/monkeair/work/pq-eth-demo/chain/rpc_url.txt")
	if err == nil {
		rpcURL = strings.TrimSpace(string(rpcData))
	}
	if rpcURL == "" {
		t.Skip("No chain RPC")
	}

	cfg := &config.Config{
		ChainRPCURL:     rpcURL,
		PayerPrivateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
	}
	client, err := NewClient(cfg)
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	ntth, err := client.ComputeNTTForward(ctx, h)
	if err != nil {
		t.Fatalf("ComputeNTTForward: %v", err)
	}

	fmt.Printf("Go NTT: first 10 ntth = ")
	for i := 0; i < 10; i++ {
		coeff := int(ntth[i*2])<<8 | int(ntth[i*2+1])
		fmt.Printf("%d ", coeff)
	}
	fmt.Println()

	fmt.Printf("Py NTT: first 10 ntth = ")
	for _, v := range vectors.NtthFirst10 {
		fmt.Printf("%d ", v)
	}
	fmt.Println()

	for i := 0; i < 10; i++ {
		goCoeff := int(ntth[i*2])<<8 | int(ntth[i*2+1])
		if goCoeff != vectors.NtthFirst10[i] {
			t.Errorf("ntth[%d] mismatch: Go=%d Python=%d", i, goCoeff, vectors.NtthFirst10[i])
		}
	}
}
