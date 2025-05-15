//go:build js && wasm
// +build js,wasm

package signer

import (
	"fmt"
	"sync"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
	"github.com/vmihailenco/msgpack/v5"
)

// SignerType represents the type of signer being used
type SignerType string

const (
	SignerTypePrivKey SignerType = "privkey"
	// SignerTypeNone    SignerType = "none"
)

// SignerManager handles event signing operations
type SignerManager struct {
	Current  Signer
	mutex    sync.Mutex
	log      zerolog.Logger
	callback js.Func
}

var sm *SignerManager

// NewSignerManager creates a new signer manager
func NewSignerManager() *SignerManager {
	componentLogger := logger.WithComponent("signer")

	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		println("cb")
		println("callback", args[0].String())
		// args[0] = event type
		// args[1] = event data (if available)
		eventData := map[string]any{
			"type": args[0].String(),
		}

		// Add event data if available
		if len(args) >= 2 {
			eventData["payload"] = args[1]
		}

		// Post message back to JavaScript
		js.Global().Get("self").Call("postMessage", eventData)
		return nil
	})

	sm = &SignerManager{
		log:      componentLogger,
		callback: callback,
	}

	// Register JavaScript functions
	js.Global().Set("signEvent", js.FuncOf(sm.jsSignEvent))
	js.Global().Set("getPublicKey", js.FuncOf(sm.jsGetPublicKey))
	js.Global().Set("setSigner", js.FuncOf(sm.jsSetSigner))

	return sm
}

// jsSignEvent handles signing event requests from JavaScript
func (sm *SignerManager) jsSignEvent(this js.Value, args []js.Value) any {
	println("signEvent")
	if len(args) < 1 {
		return js.Error{Value: js.ValueOf("Not enough arguments for signEvent")}
	}
	println("signing")
	binaryData := args[0]
	println("sig")
	// Convert JS Uint8Array to Go []byte
	length := binaryData.Length()
	goBytes := make([]byte, length)
	js.CopyBytesToGo(goBytes, binaryData)

	println("sug")
	// Deserialize the binary data
	var event nostr.Event
	if err := msgpack.Unmarshal(goBytes, &event); err != nil {
		println("err")
		return js.Error{Value: js.ValueOf("Failed to parse binary data: " + err.Error())}
	}

	println("sog", event.Kind)

	// Sign the event using the manager
	go sm.SignEvent(&event)

	return nil
}

// jsGetPublicKey handles get public key requests from JavaScript
func (sm *SignerManager) jsGetPublicKey(this js.Value, args []js.Value) any {
	// Get public key using the manager
	go sm.GetPublicKey()

	return nil
}

// jsSetSigner handles setting the signer from JavaScript
func (sm *SignerManager) jsSetSigner(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.Error{Value: js.ValueOf("Not enough arguments for setSigner")}
	}

	signerType := SignerType(args[0].String())
	var signerData string
	if !args[1].IsUndefined() && !args[1].IsNull() {
		signerData = args[1].String()
	}
	println("signerData", signerData)
	// Set the signer
	err := sm.SetSigner(signerType, signerData)
	if err != nil {
		return js.Error{Value: js.ValueOf("Failed to set signer: " + err.Error())}
	}

	return nil
}

// SignEvent signs an event with the current signer
func (sm *SignerManager) SignEvent(event *nostr.Event) error {
	sm.log.Info().
		Int("kind", event.Kind).
		Msg("Signing event")

	sm.mutex.Lock()
	signer := sm.Current
	sm.mutex.Unlock()

	// Set created_at if not already set
	if event.CreatedAt == 0 {
		event.CreatedAt = nostr.Timestamp(time.Now().Unix())
	}

	// Sign the event
	err := signer.SignEvent(event)
	if err != nil {
		return err
	}

	// Re-encode the signed event with msgpack
	pack, err := msgpack.Marshal(event)
	if err != nil {
		sm.log.Error().Err(err).Msg("Failed to encode signed event")
	}
	// Create a JavaScript Uint8Array to hold the MessagePack data
	uint8Array := js.Global().Get("Uint8Array").New(len(pack))

	// Copy the Go bytes to the JavaScript Uint8Array
	js.CopyBytesToJS(uint8Array, pack)
	println("invoke")
	sm.callback.Invoke("SIGNED", uint8Array)

	return nil
}

// GetPublicKey returns the public key of the current signer
func (sm *SignerManager) GetPublicKey(cb ...bool) error {
	sm.log.Info().
		Msg("Getting public key")

	sm.mutex.Lock()
	signer := sm.Current
	sm.mutex.Unlock()

	// Get the public key
	pubkey, err := signer.GetPublicKey()
	if err != nil {
		return err
	}

	sm.callback.Invoke("PUBKEY", pubkey)

	return nil
}

// SetSigner sets the current signer
func (sm *SignerManager) SetSigner(signerType SignerType, signerData string) error {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	var newSigner Signer
	var err error

	switch signerType {
	case SignerTypePrivKey:
		println("setting up new signer")
		newSigner, err = NewPrivateKeySigner(signerData)
		if err != nil {
			return fmt.Errorf("failed to create private key signer: %w", err)
		}
	default:
		newSigner, err = NewPrivateKeySigner(signerData)
		if err != nil {
			return fmt.Errorf("failed to create private key signer: %w", err)
		}
	}

	sm.Current = newSigner
	sm.log.Info().
		Str("type", string(signerType)).
		Msg("Signer changed")

	return nil
}
