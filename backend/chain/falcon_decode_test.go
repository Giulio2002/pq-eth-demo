package chain

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

func TestDecodeFalconPK(t *testing.T) {
	// Read test vectors
	data, err := os.ReadFile("/tmp/test_vectors.json")
	if err != nil {
		t.Skip("No test vectors at /tmp/test_vectors.json — run test_go_decode.py first")
	}
	var vectors struct {
		PkHex     string `json:"pk_hex"`
		SigHex    string `json:"sig_hex"`
		HFirst10  []int  `json:"h_first10"`
		S2First10 []int  `json:"s2_first10"`
		NonceHex  string `json:"nonce_hex"`
	}
	json.Unmarshal(data, &vectors)

	pk, _ := hex.DecodeString(vectors.PkHex)
	sig, _ := hex.DecodeString(vectors.SigHex)

	// Test pk decode
	h, err := DecodeFalconPK(pk)
	if err != nil {
		t.Fatalf("DecodeFalconPK failed: %v", err)
	}

	fmt.Printf("Go pk decode: first 10 h = ")
	for i := 0; i < 10; i++ {
		fmt.Printf("%d ", h[i])
	}
	fmt.Println()

	fmt.Printf("Py pk decode: first 10 h = ")
	for i := 0; i < 10; i++ {
		fmt.Printf("%d ", vectors.HFirst10[i])
	}
	fmt.Println()

	for i := 0; i < 10; i++ {
		if int(h[i]) != vectors.HFirst10[i] {
			t.Errorf("h[%d] mismatch: Go=%d Python=%d", i, h[i], vectors.HFirst10[i])
		}
	}

	// Test sig decode
	decoded, err := DecodeFalconSig(sig)
	if err != nil {
		t.Fatalf("DecodeFalconSig failed: %v", err)
	}

	// decoded = s2_flat(1024) + nonce(40) = 1064 bytes
	if len(decoded) != 1064 {
		t.Fatalf("decoded sig length: got %d, want 1064", len(decoded))
	}

	// Extract s2 coefficients (uint16 BE) and compare
	fmt.Printf("Go sig decode: first 10 s2 = ")
	for i := 0; i < 10; i++ {
		coeff := int(decoded[i*2])<<8 | int(decoded[i*2+1])
		fmt.Printf("%d ", coeff)
	}
	fmt.Println()

	fmt.Printf("Py sig decode: first 10 s2 = ")
	for i := 0; i < 10; i++ {
		fmt.Printf("%d ", vectors.S2First10[i])
	}
	fmt.Println()

	for i := 0; i < 10; i++ {
		goCoeff := int(decoded[i*2])<<8 | int(decoded[i*2+1])
		if goCoeff != vectors.S2First10[i] {
			t.Errorf("s2[%d] mismatch: Go=%d Python=%d", i, goCoeff, vectors.S2First10[i])
		}
	}

	// Check nonce
	goNonce := hex.EncodeToString(decoded[1024:])
	if goNonce != vectors.NonceHex {
		t.Errorf("nonce mismatch:\n  Go: %s\n  Py: %s", goNonce, vectors.NonceHex)
	}
}
