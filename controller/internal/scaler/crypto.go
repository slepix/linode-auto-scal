package scaler

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

func deriveKey(secretKey string) []byte {
	salt := []byte("linode-autoscaler-salt-v1")
	return pbkdf2.Key([]byte(secretKey), salt, 100000, 32, sha256.New)
}

func Encrypt(secretKey, plaintext string) (string, error) {
	key := deriveKey(secretKey)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.URLEncoding.EncodeToString(ciphertext), nil
}

func Decrypt(secretKey, ciphertext string) (string, error) {
	key := deriveKey(secretKey)
	data, err := base64.URLEncoding.DecodeString(ciphertext)
	if err != nil {
		// Try standard base64 as fallback (Python Fernet compatibility)
		data, err = base64.StdEncoding.DecodeString(ciphertext)
		if err != nil {
			return "", fmt.Errorf("base64 decode failed: %w", err)
		}
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertextBytes := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func GeneratePassword(length int) (string, error) {
	b := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b)[:length], nil
}
