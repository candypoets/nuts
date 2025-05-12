//go:build js && wasm
// +build js,wasm

package main

import (
	"syscall/js"

	"github.com/candypoets/nutscash/cashu/logger"
	"github.com/candypoets/nutscash/cashu/wallet"
)

// Debug mode flag
const debugMode = true

func Initialize() {
	logger.Initialize(debugMode)
	wallet.NewWalletManager()

	// Signal that initialization is complete by calling the JS callback
	js.Global().Call("cashuWasmInitialized", js.ValueOf(map[string]any{
		"version": "1.0.1",
	}))
}

func main() {
	Initialize()
	c := make(chan struct{})
	<-c
}
