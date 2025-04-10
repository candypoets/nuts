package signer

import (
	"github.com/nbd-wtf/go-nostr"
)

// Signer defines the interface for cryptographic operations in Nostr
// This interface allows for different implementations (e.g., in-memory keys, hardware keys, etc.)
type Signer interface {
	// GetPublicKey returns the public key for this signer
	GetPublicKey() (string, error)

	// SignEvent signs a Nostr event with the private key
	SignEvent(event *nostr.Event) error

	// NIP04Encrypt encrypts a message for a recipient using NIP-04
	NIP04Encrypt(recipientPubKey, plaintext string) (string, error)

	// NIP04Decrypt decrypts a message from a sender using NIP-04
	NIP04Decrypt(senderPubKey, ciphertext string) (string, error)

	// NIP44Encrypt encrypts a message for a recipient using NIP-44
	NIP44Encrypt(recipientPubKey, plaintext string) (string, error)

	// NIP44Decrypt decrypts a message from a sender using NIP-44
	NIP44Decrypt(senderPubKey, ciphertext string) (string, error)

	// CreateAndSignEvent creates a new nostr event, populates it with the given data, and signs it
	CreateAndSignEvent(kind int, content string, tags [][]string) (*nostr.Event, error)
}