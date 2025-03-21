//go:build js && wasm
// +build js,wasm

package main

import (
	"encoding/json"
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
	globalManager = subscriptions.NewSubscriptionManager(nostrDb, nostrParser)
	registerCallbacks()
	// Signal that initialization is complete by calling the JS callback
	js.Global().Call("nostrWasmInitialized", js.ValueOf(map[string]interface{}{
		"version": "1.0.1",
	}))
}

// JavaScript bridge functions
func jsOpenSubscription(this js.Value, args []js.Value) interface{} {

	if len(args) < 3 {
		return js.Error{Value: js.ValueOf("Not enough arguments")}
	}

	subscriptionID := args[0].String()
	binaryData := args[1]
	callback := args[2]

	// Convert JS Uint8Array to Go []byte
	length := binaryData.Length()
	goBytes := make([]byte, length)
	js.CopyBytesToGo(goBytes, binaryData)

	// Deserialize the binary data
	var requests []types.Request
	if err := msgpack.Unmarshal(goBytes, &requests); err != nil {
		return js.Error{Value: js.ValueOf("Failed to parse binary data: " + err.Error())}
	}

	// Log the parsed requests array as JSON
	debugJSON, err := json.MarshalIndent(requests, "", "  ")
	if err != nil {
		js.Global().Get("console").Call("error", "Failed to marshal requests for debugging:", err.Error())
	} else {
		js.Global().Get("console").Call("log", "Parsed requests:", string(debugJSON))
	}

	// Create persistent callback
	persistentCallback := js.FuncOf(func(this js.Value, callbackArgs []js.Value) any {
		callback.Invoke(callbackArgs[0], callbackArgs[1])
		return nil
	})

	// Open subscription using the manager
	if err := globalManager.OpenSubscription(subscriptionID, requests, persistentCallback); err != nil {
		return js.ValueOf(map[string]any{
			"error": fmt.Sprintf("Something bad happened: %v", err),
		})
	}

	return nil
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
