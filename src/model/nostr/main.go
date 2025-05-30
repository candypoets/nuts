//go:build js && wasm
// +build js,wasm

// This file contains WebAssembly-specific code for integration with JavaScript

package main

import (
	"runtime"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/nostr/db"
	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/candypoets/nutscash/nostr/network"
	"github.com/candypoets/nutscash/nostr/network/subscriptions"
	"github.com/candypoets/nutscash/nostr/parser"
	"github.com/candypoets/nutscash/nostr/relays"
	"github.com/candypoets/nutscash/nostr/signer"
)

// Debug mode flag
const debugMode = true

// Global instances that will be exposed to JavaScript
var (
	nostrParser  *parser.Parser
	nostrSigner  *signer.SignerManager
	subManager   subscriptions.SubscriptionManager
	relayManager relays.RelayManager
)

var defaultRelays = []string{"wss://relay.snort.social", "wss://relay.damus.io", "wss://relay.primal.net"}
var indexerRelays = []string{"wss://user.kindpag.es", "wss://relay.nos.social", "wss://purplepag.es", "wss://relay.nostr.band"}

func trackGoroutines(m *runtime.MemStats) {
	runtime.ReadMemStats(m)
	if relayManager != nil {
		eventData := map[string]any{
			"type":        "DEBUG",
			"goroutines":  runtime.NumGoroutine(),
			"cpu":         m.Alloc / 1024,
			"connections": relayManager.GetConnectionCount(),
		}
		// Post message back to JavaScript
		js.Global().Get("self").Call("postMessage", eventData)
	}

}

// Call periodically to monitor
func monitorGoroutines() {
	if debugMode == true {
		var m runtime.MemStats
		for {
			trackGoroutines(&m)
			time.Sleep(500 * time.Millisecond)
		}
	}
}

func Initialize() {
	logger.Initialize(false)
	nostrDb := db.InitNostrDB()
	signerManager := signer.NewSignerManager()
	relayManager = relays.NewRelayConnectionManager(10*time.Second, 3)
	nostrParser = parser.NewParser(nostrDb, signerManager, relayManager, defaultRelays, indexerRelays)
	// Initialize managers
	subManager = subscriptions.NewSubscriptionManager(nostrDb, nostrParser, relayManager, subscriptions.DefaultConfig())
	network.NewPublishManager(nostrDb, nostrParser, relayManager)
	network.NewZapManager(nostrParser, nostrDb, []string{})

	// Signal that initialization is complete by calling the JS callback
	js.Global().Call("nostrWasmInitialized", js.ValueOf(map[string]any{
		"version": "1.0.1",
	}))
}

func main() {
	// Start the monitor in your main function
	// go monitorGoroutines()
	// This function is required for the wasm build
	Initialize()
	c := make(chan struct{})
	<-c
}
