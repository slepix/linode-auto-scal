package scaler

import (
	"fmt"
	"math/rand"
	"time"
)

const shortIDChars = "abcdefghijklmnopqrstuvwxyz0123456789"

func GenerateInstanceLabel(labelPrefix, region string) string {
	ts := time.Now().Unix()
	shortID := randomShortID(4)
	regionSlug := region
	return fmt.Sprintf("%s-%s-%d-%s", labelPrefix, regionSlug, ts, shortID)
}

func randomShortID(n int) string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, n)
	for i := range b {
		b[i] = shortIDChars[r.Intn(len(shortIDChars))]
	}
	return string(b)
}
