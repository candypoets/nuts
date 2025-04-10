package signer

import (
	"encoding/hex"

	"github.com/nbd-wtf/go-nostr"
	"github.com/nbd-wtf/go-nostr/nip04"
	"github.com/nbd-wtf/go-nostr/nip44"
)

// Ensure PrivateKeySigner implements the Signer interface
var _ Signer = (*PrivateKeySigner)(nil)

// PrivateKeySigner provides cryptographic operations using a private key
// It implements methods for NIP-04, NIP-44 encryption/decryption, and event signing
type PrivateKeySigner struct {
	Sk string // hex encoded private key
	Pk string // hex encoded public key
}

// NewPrivateKeySigner creates a new PrivateKeySigner from a hex-encoded private key
func NewPrivateKeySigner(privateKeyHex string) (*PrivateKeySigner, error) {
	// Validate the private key
	pubkey, err := nostr.GetPublicKey(privateKeyHex)
	if err != nil {
		return nil, err
	}

	return &PrivateKeySigner{
		Sk: privateKeyHex,
		Pk: pubkey,
	}, nil
}

// GetPrivateKey returns the private key (hex encoded)
// This method is not part of the Signer interface for security reasons
// but is useful for certain internal operations
func (s *PrivateKeySigner) GetPrivateKey() string {
	return s.Sk
}

// GetPublicKey returns the public key corresponding to the private key
func (s *PrivateKeySigner) GetPublicKey() (string, error) {
	return s.Pk, nil
}

// SignEvent signs a nostr event with the private key
func (s *PrivateKeySigner) SignEvent(event *nostr.Event) error {
	return event.Sign(s.Sk)
}

// NIP04Encrypt encrypts a message for a recipient using NIP-04
func (s *PrivateKeySigner) NIP04Encrypt(recipientPubKey, plaintext string) (string, error) {
	// Convert hex private key to bytes
	skBytes, err := hex.DecodeString(s.Sk)
	if err != nil {
		return "", err
	}

	return nip04.Encrypt(plaintext, skBytes)
}

// NIP04Decrypt decrypts a message from a sender using NIP-04
func (s *PrivateKeySigner) NIP04Decrypt(senderPubKey, ciphertext string) (string, error) {

	skBytes, err := nip04.ComputeSharedSecret(senderPubKey, s.Sk)
	if err != nil {
		return "", err
	}

	return nip04.Decrypt(ciphertext, skBytes)
}

// NIP44Encrypt encrypts a message for a recipient using NIP-44
func (s *PrivateKeySigner) NIP44Encrypt(recipientPubKey, plaintext string) (string, error) {

	skBytes, err := nip44.GenerateConversationKey(recipientPubKey, s.Sk)
	if err != nil {
		return "", err
	}

	return nip44.Encrypt(plaintext, skBytes)
}

// NIP44Decrypt decrypts a message from a sender using NIP-44
func (s *PrivateKeySigner) NIP44Decrypt(senderPubKey, ciphertext string) (string, error) {
	skBytes, err := nip44.GenerateConversationKey(senderPubKey, s.Sk)
	if err != nil {
		return "", err
	}

	return nip44.Decrypt(ciphertext, skBytes)
}

// CreateAndSignEvent creates a new nostr event, populates it with the given data, and signs it
func (s *PrivateKeySigner) CreateAndSignEvent(kind int, content string, tags [][]string) (*nostr.Event, error) {
	pubkey, err := s.GetPublicKey()
	if err != nil {
		return nil, err
	}

	// Convert string tags to nostr.Tags
	nostrTags := make(nostr.Tags, len(tags))
	for i, tag := range tags {
		nostrTags[i] = tag
	}

	event := nostr.Event{
		PubKey:    pubkey,
		CreatedAt: nostr.Now(),
		Kind:      kind,
		Tags:      nostrTags,
		Content:   content,
	}

	// Sign the event
	err = s.SignEvent(&event)
	if err != nil {
		return nil, err
	}

	return &event, nil
}
