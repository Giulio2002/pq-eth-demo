package chain

import (
	"context"
	"encoding/binary"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
)

const (
	falconN         = 512
	falconQ         = 12289
	falconPsi       = 49
	falconNonceLen  = 40
	falconCoeffSize = 2 // uint16 BE per coefficient
	falconVecSize   = falconN * falconCoeffSize // 1024 bytes
)

// DecodeFalconPK decodes a standard 897-byte Falcon-512 public key into 512 raw h coefficients.
// Standard format: 1 byte header (0x09) + 896 bytes of 14-bit packed values.
func DecodeFalconPK(pk []byte) ([]uint16, error) {
	if len(pk) != 897 {
		return nil, fmt.Errorf("falcon pk must be 897 bytes, got %d", len(pk))
	}
	// Byte 0 is header, skip it
	data := pk[1:] // 896 bytes = 512 × 14 bits = 7168 bits

	h := make([]uint16, falconN)
	bitPos := 0
	for i := 0; i < falconN; i++ {
		val := readBits(data, bitPos, 14)
		h[i] = uint16(val)
		bitPos += 14
	}
	return h, nil
}

// readBits reads `n` bits starting at bit offset `bitOffset` from data, MSB first.
func readBits(data []byte, bitOffset int, n int) uint32 {
	var val uint32
	for i := 0; i < n; i++ {
		byteIdx := (bitOffset + i) / 8
		bitIdx := 7 - ((bitOffset + i) % 8) // MSB first
		if byteIdx < len(data) {
			bit := (data[byteIdx] >> uint(bitIdx)) & 1
			val = (val << 1) | uint32(bit)
		}
	}
	return val
}

// PackCoeffsUint16BE packs 512 coefficients as 1024 bytes of uint16 big-endian.
func PackCoeffsUint16BE(coeffs []uint16) []byte {
	out := make([]byte, len(coeffs)*2)
	for i, c := range coeffs {
		binary.BigEndian.PutUint16(out[i*2:], c)
	}
	return out
}

// ComputeNTTForward calls the NTT_FW precompile (0x12) to compute the NTT of h coefficients.
// Returns 512 NTT-domain coefficients packed as uint16 BE (1024 bytes).
func (c *Client) ComputeNTTForward(ctx context.Context, hCoeffs []uint16) ([]byte, error) {
	// NTT_FW precompile input: n(32) | q(32) | psi(32) | coeffs(1024)
	input := make([]byte, 96+falconVecSize)

	// n = 512
	nBig := new(big.Int).SetUint64(falconN)
	copy(input[0:32], common.LeftPadBytes(nBig.Bytes(), 32))

	// q = 12289
	qBig := new(big.Int).SetUint64(falconQ)
	copy(input[32:64], common.LeftPadBytes(qBig.Bytes(), 32))

	// psi = 49 (primitive root of unity)
	psiBig := new(big.Int).SetUint64(falconPsi)
	copy(input[64:96], common.LeftPadBytes(psiBig.Bytes(), 32))

	// coefficients as uint16 BE
	coeffBytes := PackCoeffsUint16BE(hCoeffs)
	copy(input[96:], coeffBytes)

	// Call precompile 0x12 (NTT_FW)
	nttAddr := common.HexToAddress("0x12")
	msg := ethereum.CallMsg{
		To:   &nttAddr,
		Data: input,
		Gas:  100000,
	}
	result, err := c.eth.CallContract(ctx, msg, nil)
	if err != nil {
		return nil, fmt.Errorf("NTT_FW precompile call failed: %w", err)
	}

	if len(result) < falconVecSize {
		return nil, fmt.Errorf("NTT_FW returned %d bytes, expected %d", len(result), falconVecSize)
	}

	return result[:falconVecSize], nil
}

// ComputeFalconVerifyKey takes a standard 897-byte Falcon pk and returns the 1024-byte
// NTT-domain verifyKey by decoding the pk and computing NTT forward via precompile 0x12.
func (c *Client) ComputeFalconVerifyKey(ctx context.Context, pk []byte) ([]byte, error) {
	// Step 1: Decode 14-bit packed coefficients
	h, err := DecodeFalconPK(pk)
	if err != nil {
		return nil, err
	}

	// Step 2: Compute NTT forward transform via precompile
	ntth, err := c.ComputeNTTForward(ctx, h)
	if err != nil {
		return nil, err
	}

	return ntth, nil
}

// DecodeFalconSig decodes a standard Falcon-512 signature into s2 coefficients + nonce.
// Standard format: 1 byte header + 40 bytes nonce + compressed s2 coefficients.
// Returns: s2_flat (1024 bytes, uint16 BE) || nonce (40 bytes) = 1064 bytes total.
func DecodeFalconSig(sig []byte) ([]byte, error) {
	if len(sig) < 42 { // minimum: header + nonce + at least 1 byte of compressed data
		return nil, fmt.Errorf("falcon sig too short: %d bytes", len(sig))
	}

	// Extract nonce: bytes 1..41
	nonce := sig[1 : 1+falconNonceLen]

	// Decode compressed s2: bytes 41+
	compData := sig[1+falconNonceLen:]
	s2, err := decodeFalconCompressed(compData)
	if err != nil {
		return nil, fmt.Errorf("decoding falcon sig: %w", err)
	}

	// Pack: s2_flat(1024) || nonce(40)
	result := make([]byte, falconVecSize+falconNonceLen)
	s2Bytes := PackCoeffsUint16BE(s2)
	copy(result[0:falconVecSize], s2Bytes)
	copy(result[falconVecSize:], nonce)

	return result, nil
}

// decodeFalconCompressed decodes the compressed Falcon signature coefficients.
// Uses the Falcon compression format: for each of 512 coefficients:
//   sign_bit(1) + low_bits(7) + unary_high (1s terminated by 0)
//   magnitude = (high << 7) | low
//   value = Q - magnitude if sign_bit else magnitude
func decodeFalconCompressed(data []byte) ([]uint16, error) {
	coeffs := make([]uint16, falconN)
	bitPos := 0

	for i := 0; i < falconN; i++ {
		if bitPos/8 >= len(data) {
			return nil, fmt.Errorf("unexpected end of compressed data at coeff %d", i)
		}

		// Read sign bit
		signBit := readOneBit(data, bitPos)
		bitPos++

		// Read 7 low bits
		low := uint32(0)
		for b := 0; b < 7; b++ {
			low = (low << 1) | uint32(readOneBit(data, bitPos))
			bitPos++
		}

		// Read unary-coded high bits: count 0-bits until we see a 1-bit
		high := uint32(0)
		for {
			if bitPos/8 >= len(data) {
				break
			}
			bit := readOneBit(data, bitPos)
			bitPos++
			if bit == 1 {
				break
			}
			high++
		}

		magnitude := (high << 7) | low
		if signBit == 1 {
			coeffs[i] = uint16((falconQ - int(magnitude)) % falconQ)
		} else {
			coeffs[i] = uint16(magnitude % falconQ)
		}
	}

	return coeffs, nil
}

// readOneBit reads a single bit at the given bit offset, MSB first.
func readOneBit(data []byte, bitOffset int) uint32 {
	byteIdx := bitOffset / 8
	bitIdx := 7 - (bitOffset % 8)
	if byteIdx >= len(data) {
		return 0
	}
	return uint32((data[byteIdx] >> uint(bitIdx)) & 1)
}
