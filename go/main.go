//go:build js && wasm
// +build js,wasm

package main

import (
	"fmt"
	"runtime"
	"syscall/js"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/logger"
	"github.com/candypoets/nutscash/parser"
	"github.com/candypoets/nutscash/subscriptions"
	"github.com/candypoets/nutscash/types"

	"github.com/vmihailenco/msgpack/v5"
)

// Debug mode flag
const debugMode = true

// Global manager instance that will be exposed to JavaScript
var globalManager *subscriptions.SubscriptionManager

var defaultRelays = []string{"wss://relay.damus.io", "wss://relay.nostr.band", "wss://purplepag.es"}

func trackGoroutines(m *runtime.MemStats) {
	// runtime.GC() // Force garbage collection
	// Print current number of goroutines

	runtime.ReadMemStats(m)
	fmt.Printf("Number of goroutines: %d\n", runtime.NumGoroutine())
	fmt.Printf("Memory usage: %d KB\n", m.Alloc/1024)
	fmt.Printf("Number of subscriptions: %d\n", globalManager.GetActiveSubscriptionCount())
}

// Call periodically to monitor
func monitorGoroutines() {
	// var m runtime.MemStats
	// for {
	// 	trackGoroutines(&m)
	// 	time.Sleep(5 * time.Second)
	// }
}

// Initialize sets up the global subscription manager with required dependencies
func Initialize() {
	logger.Initialize(debugMode)
	nostrDb := db.InitNostrDB()
	nostrParser := parser.NewParser(nostrDb, defaultRelays)

	callback := js.FuncOf(func(this js.Value, args []js.Value) any {
		// args[0] = event type
		// args[1] = subscription ID
		// args[2] = event data
		// Basic event with type and subscription ID
		eventData := map[string]any{
			"type":           args[0].String(),
			"subscriptionId": args[1].String(),
		}

		// Add event data if available
		if len(args) >= 3 {
			eventData["eventData"] = args[2]
		}

		// Post message back to JavaScript
		js.Global().Get("self").Call("postMessage", eventData)
		return nil
	})

	globalManager = subscriptions.NewSubscriptionManager(nostrDb, nostrParser, callback)

	registerCallbacks()

	// Signal that initialization is complete by calling the JS callback
	js.Global().Call("nostrWasmInitialized", js.ValueOf(map[string]any{
		"version": "1.0.1",
	}))
}

// JavaScript bridge functions
func jsOpenSubscription(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return js.Error{Value: js.ValueOf("Not enough arguments")}
	}

	subscriptionID := args[0].String()
	binaryData := args[1]

	// Convert JS Uint8Array to Go []byte
	length := binaryData.Length()
	goBytes := make([]byte, length)
	js.CopyBytesToGo(goBytes, binaryData)

	// Deserialize the binary data
	var requests []types.Request
	if err := msgpack.Unmarshal(goBytes, &requests); err != nil {
		return js.Error{Value: js.ValueOf("Failed to parse binary data: " + err.Error())}
	}

	// Open subscription using the manager
	if err := globalManager.OpenSubscription(subscriptionID, requests); err != nil {
		return js.Error{Value: js.ValueOf("Failed to open subscription: " + err.Error())}
	}

	return js.ValueOf(true)
}

func jsCloseSubscription(this js.Value, args []js.Value) any {
	if len(args) < 1 {
		return js.Error{Value: js.ValueOf("Subscription ID required")}
	}

	subscriptionID := args[0].String()
	globalManager.CloseSubscription(subscriptionID)
	return nil
}

// Register functions for JavaScript access
func registerCallbacks() {
	js.Global().Set("openSubscription", js.FuncOf(jsOpenSubscription))
	js.Global().Set("closeSubscription", js.FuncOf(jsCloseSubscription))
}

func main() {
	// Start the monitor in your main function
	go monitorGoroutines()
	// This function is required for the wasm build
	Initialize()
	c := make(chan struct{})
	<-c
}
