//go:build js && wasm
// +build js,wasm

// This file contains WebAssembly-specific code for integration with JavaScript

package main

import (
	"fmt"
	"runtime"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/nostr/db"
	"github.com/candypoets/nutscash/nostr/logger"
	"github.com/candypoets/nutscash/nostr/network"
	"github.com/candypoets/nutscash/nostr/parser"
	"github.com/candypoets/nutscash/nostr/signer"
)

// Debug mode flag
const debugMode = true

// Global instances that will be exposed to JavaScript
var (
	nostrParser *parser.Parser
)

var defaultRelays = []string{"wss://relay.damus.io", "wss://relay.nostr.band", "wss://purplepag.es"}

func trackGoroutines(m *runtime.MemStats) {
	runtime.ReadMemStats(m)
	fmt.Printf("Number of goroutines: %d\n", runtime.NumGoroutine())
	fmt.Printf("Memory usage: %d KB\n", m.Alloc/1024)
	// fmt.Printf("Number of subscriptions: %d\n", globalSubscriptionManager.GetActiveSubscriptionCount())
	// fmt.Printf("Number of active publishes: %d\n", globalPublishManager.GetActivePublishCount())
}

// Call periodically to monitor
func monitorGoroutines() {
	// var m runtime.MemStats
	// for {
	// 	trackGoroutines(&m)
	// 	time.Sleep(5 * time.Second)
	// }
}

func Initialize() {
	logger.Initialize(debugMode)
	nostrDb := db.InitNostrDB()
	nostrParser = parser.NewParser(nostrDb, defaultRelays)
	relayManager := network.NewRelayConnectionManager(10*time.Second, 3)

	// Initialize managers
	network.NewSubscriptionManager(nostrDb, nostrParser, relayManager)
	network.NewPublishManager(nostrDb, nostrParser, relayManager)
	network.NewZapManager(nostrParser, nostrDb, []string{})

	js.Global().Set("loginWithPrivateKey", js.FuncOf(jsLoginWithPrivateKey))

	// Signal that initialization is complete by calling the JS callback
	js.Global().Call("nostrWasmInitialized", js.ValueOf(map[string]any{
		"version": "1.0.1",
	}))
}

// Login with private key and verify
func jsLoginWithPrivateKey(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.Error{Value: js.ValueOf("Private key required")}
	}

	// Get the private key from arguments
	privateKeyHex := args[0].String()

	// Import our custom signer package
	pkSigner, err := signer.NewPrivateKeySigner(privateKeyHex)
	if err != nil {
		return js.Error{Value: js.ValueOf("Invalid private key: " + err.Error())}
	}

	// Update the signer for the subscription and publish managers
	nostrParser.Signer = pkSigner

	// Return successful login info
	return js.ValueOf(map[string]any{
		"success": true,
		"pubkey":  pkSigner.Pk,
	})
}

func main() {
	// Start the monitor in your main function
	go monitorGoroutines()
	// This function is required for the wasm build
	Initialize()
	c := make(chan struct{})
	<-c
}
