//go:build js && wasm
// +build js,wasm

package cashu

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"sync"
	"syscall/js"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/elnosh/gonuts/cashu"
	"github.com/elnosh/gonuts/cashu/nuts/nut11"
	"github.com/elnosh/gonuts/wallet"
	"github.com/elnosh/gonuts/wallet/storage"
	"github.com/nbd-wtf/go-nostr"
)

// walletManager holds the active wallets and manages access to them.
type walletManager struct {
	Wallets  map[string]*wallet.Wallet
	mu       sync.RWMutex
	callback js.Func
}

// Global instance of the wallet Manager.
// Initialized lazily in NewWallet.
var Manager = &walletManager{}

// NewWallet creates a new wallet instance, initializes the wallets map if necessary,
// stores the new wallet in the map using its secret as the key, and returns the created wallet.
func NewWallet(secret string, mint string) (*wallet.Wallet, error) {
	Manager.mu.Lock()
	defer Manager.mu.Unlock()
	// Initialize map if it's nil (lazy initialization)
	if Manager.Wallets == nil {
		Manager.Wallets = make(map[string]*wallet.Wallet)
	}

	pubkey, err := nostr.GetPublicKey(secret)
	if err != nil {
		return nil, fmt.Errorf("failed to get public key from secret: %w", err)
	}

	db, err := storage.InitBrowser(pubkey)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize browser storage: %w", err)
	}

	config := wallet.Config{
		CurrentMintURL: mint,
	}

	// Create a new wallet instance
	newWallet, err := wallet.LoadWallet(config)
	if err != nil {
		// Ensure db is closed if LoadWallet fails
		db.Close()
		return nil, fmt.Errorf("failed to load wallet: %w", err)
	}

	// Store the wallet in the map, keyed by the secret
	Manager.Wallets[secret] = newWallet

	// Return the newly created wallet
	return newWallet, nil
}

// Initialize sets up the JS bridge for the wallet functions
func Initialize() {
	// Register the global wallet function handler
	js.Global().Set("callWalletMethod", js.FuncOf(Manager.callWallet))

	// Register function to create a new wallet
	js.Global().Set("createCashuWallet", js.FuncOf(createWallet))

	// Subscription callback
	Manager.callback = js.FuncOf(func(this js.Value, args []js.Value) any {
		if len(args) == 0 {
			fmt.Println("Warning: manager.callback called with no arguments.")
			return nil
		}
		walletData := map[string]any{
			"requestID": args[0].String(),
			"data":      args[1],
		}
		// Post message back to JavaScript
		js.Global().Get("self").Call("postMessage", walletData)
		return nil
	})
}

// createWallet is the JS bridge function to create a new wallet (synchronous)
func createWallet(this js.Value, args []js.Value) any {
	if len(args) < 2 {
		return createJSError("createWallet requires secret and mint URL parameters")
	}

	secret := args[0].String()
	mintURL := args[1].String()

	_, err := NewWallet(secret, mintURL)
	if err != nil {
		// Use the error returned by NewWallet
		return createJSError(fmt.Sprintf("Failed to create wallet: %v", err))
	}

	// Return only success and the key used to access the wallet later
	return js.ValueOf(map[string]any{
		"success":   true,
		"walletKey": secret,
	})
}

// callWalletMethod is the main JS bridge function to call any method on the wallet asynchronously.
func (m *walletManager) callWallet(this js.Value, args []js.Value) any {
	// Expected arguments: walletKey, methodName, callback, [params...]
	if len(args) < 3 {
		// Return synchronous error if basic structure is wrong
		return createJSError("Not enough arguments. Expected: walletKey, methodName, callback, [params...]")
	}

	callId := args[0].String() // Convert callId to string for logging/use
	walletKey := args[1].String()
	methodName := args[2].String()

	// Extract method-specific parameters
	params := args[3:]

	// Launch the wallet method execution in a goroutine
	go func() {
		var err error // Define error variable outside the switch

		// Recover from potential panics in the goroutine
		defer func() {
			if r := recover(); r != nil {
				errMsg := fmt.Sprintf("Panic recovered in callWalletMethod (callId: %s, method: %s): %v", callId, methodName, r)
				fmt.Println("Error:", errMsg) // Log the panic to console
				Manager.callback.Invoke(callId, createJSError(errMsg))
			} else if err != nil {
				// Handle errors that occurred during execution
				errMsg := fmt.Sprintf("Error in callWalletMethod (callId: %s, method: %s): %v", callId, methodName, err)
				fmt.Println("Error:", errMsg) // Log the error
				Manager.callback.Invoke(callId, createJSError(err.Error()))
			}
		}()

		// Safely get the wallet instance using RLock for read access
		Manager.mu.RLock()
		wal, ok := Manager.Wallets[walletKey]
		Manager.mu.RUnlock() // Release read lock immediately after getting the wallet

		if !ok {
			err = fmt.Errorf("wallet with key '%s' not found or not initialized", walletKey)
			return // Error will be handled by defer
		}

		// Define result variable
		var result any

		// --- Execute the requested method ---
		switch methodName {
		// --- Balance related methods ---
		case "GetBalance":
			result = wal.GetBalance() // Returns uint64

		case "GetBalanceByMints":
			result = wal.GetBalanceByMints() // Returns map[string]uint64

		case "PendingBalance":
			result = wal.PendingBalance() // Returns uint64

		// --- Mint related methods ---
		case "RequestMint":
			if len(params) < 2 {
				err = fmt.Errorf("RequestMint requires amount (number) and mint (string) parameters")
				break
			}
			amount := uint64(params[0].Int())
			mint := params[1].String()
			result, err = wal.RequestMint(amount, mint)

		case "MintQuoteState":
			if len(params) < 1 {
				err = fmt.Errorf("MintQuoteState requires quoteId (string) parameter")
				break
			}
			quoteId := params[0].String()
			result, err = wal.MintQuoteState(quoteId)

		case "MintTokens":
			if len(params) < 1 {
				err = fmt.Errorf("MintTokens requires quoteId (string) parameter")
				break
			}
			quoteId := params[0].String()
			result, err = wal.MintTokens(quoteId) // Returns uint64

		// --- Send/Receive related methods ---
		case "Send":
			if len(params) < 3 {
				err = fmt.Errorf("Send requires amount (number), mintURL (string), and includeFees (boolean) parameters")
				break
			}
			amount := uint64(params[0].Int())
			mintURL := params[1].String()
			includeFees := params[2].Bool()
			result, err = wal.Send(amount, mintURL, includeFees)

		case "SendToPubkey":
			// Expected JS params: amount (number), mintURL (string), pubkeyHex (string), tags (object|null), includeFees (boolean)
			if len(params) < 5 {
				err = fmt.Errorf("SendToPubkey requires amount, mintURL, pubkeyHex, tags (object or null), and includeFees parameters")
				break
			}
			amount := uint64(params[0].Int())
			mintURL := params[1].String()
			pubkeyHex := params[2].String()
			tagsJS := params[3]
			includeFees := params[4].Bool()

			var pubkey *btcec.PublicKey
			var pubkeyBytes []byte
			pubkeyBytes, err = hex.DecodeString(pubkeyHex)
			if err != nil {
				err = fmt.Errorf("invalid pubkey hex: %w", err)
				break
			}
			pubkey, err = btcec.ParsePubKey(pubkeyBytes)
			if err != nil {
				err = fmt.Errorf("invalid pubkey format: %w", err)
				break
			}

			var tags *nut11.P2PKTags
			if !tagsJS.IsNull() && !tagsJS.IsUndefined() {
				tags = &nut11.P2PKTags{}
				// NUT-11 P2PKTags struct uses Sigflag, Locktime, NPubs, K, etc.
				// Map relevant fields from JS object if needed. Example for Sigflag:
				if tagsJS.Get("sigflag").Type() == js.TypeString {
					tags.Sigflag = tagsJS.Get("sigflag").String() // e.g., "SIG_ALL"
				}
				// Add more parsing here based on how tags are structured in JS
			}

			result, err = wal.SendToPubkey(amount, mintURL, pubkey, tags, includeFees)

		case "HTLCLockedProofs":
			// Expected JS params: amount (number), mintURL (string), preimage (string), tags (object|null), includeFees (boolean)
			if len(params) < 5 {
				err = fmt.Errorf("HTLCLockedProofs requires amount, mintURL, preimage, tags (object or null), and includeFees parameters")
				break
			}
			amount := uint64(params[0].Int())
			mintURL := params[1].String()
			preimage := params[2].String()
			tagsJS := params[3]
			includeFees := params[4].Bool()

			tags, err := parseP2PKTags(tagsJS)
			if err != nil {
				err = fmt.Errorf("failed to parse P2PK tags: %w", err)
				break
			}

			result, err = wal.HTLCLockedProofs(amount, mintURL, preimage, tags, includeFees)

		case "Receive":
			if len(params) < 2 {
				err = fmt.Errorf("Receive requires token (stringified JSON) and swapToTrusted (boolean) parameters")
				break
			}
			tokenJson := params[0].String()
			swapToTrusted := params[1].Bool()

			var token cashu.Token
			err = json.Unmarshal([]byte(tokenJson), &token)
			if err != nil {
				err = fmt.Errorf("invalid token JSON: %w", err)
				break
			}

			result, err = wal.Receive(token, swapToTrusted) // Returns uint64

		case "ReceiveHTLC":
			if len(params) < 2 {
				err = fmt.Errorf("ReceiveHTLC requires token (stringified JSON) and preimage (string) parameters")
				break
			}
			tokenJson := params[0].String()
			preimage := params[1].String()

			var token cashu.Token
			err = json.Unmarshal([]byte(tokenJson), &token)
			if err != nil {
				err = fmt.Errorf("invalid token JSON: %w", err)
				break
			}

			result, err = wal.ReceiveHTLC(token, preimage) // Returns uint64

		// --- Melt related methods ---
		case "RequestMeltQuote":
			if len(params) < 2 {
				err = fmt.Errorf("RequestMeltQuote requires request (string) and mint (string) parameters")
				break
			}
			request := params[0].String()
			mint := params[1].String()
			result, err = wal.RequestMeltQuote(request, mint)

		case "CheckMeltQuoteState":
			if len(params) < 1 {
				err = fmt.Errorf("CheckMeltQuoteState requires quoteId (string) parameter")
				break
			}
			quoteId := params[0].String()
			result, err = wal.CheckMeltQuoteState(quoteId)

		case "Melt":
			if len(params) < 1 {
				err = fmt.Errorf("Melt requires quoteId (string) parameter")
				break
			}
			quoteId := params[0].String()
			result, err = wal.Melt(quoteId)

		case "MultiMintPayment":
			if len(params) < 2 {
				err = fmt.Errorf("MultiMintPayment requires request (string) and split (object) parameters")
				break
			}
			request := params[0].String()
			splitObj := params[1]

			if splitObj.Type() != js.TypeObject {
				err = fmt.Errorf("split parameter must be an object")
				break
			}

			// Convert JS object to Go map[string]uint64
			split := make(map[string]uint64)
			keys := js.Global().Get("Object").Call("keys", splitObj)
			keysLen := keys.Length()
			for i := 0; i < keysLen; i++ {
				key := keys.Index(i).String()
				value := splitObj.Get(key)
				if value.Type() == js.TypeNumber {
					split[key] = uint64(value.Int()) // Use Int() for safe conversion
				} else {
					err = fmt.Errorf("split object values must be numbers (representing msat amounts)")
					break // Exit inner loop
				}
			}
			if err != nil { // Check if error occurred during inner loop
				break
			}

			result, err = wal.MultiMintPayment(request, split)

		// --- Mint management methods ---
		case "AddMint":
			if len(params) < 1 {
				err = fmt.Errorf("AddMint requires mint (string) parameter")
				break
			}
			mint := params[0].String()
			result, err = wal.AddMint(mint)

		case "MintSwap":
			if len(params) < 3 {
				err = fmt.Errorf("MintSwap requires amount (number), from (string), and to (string) parameters")
				break
			}
			amount := uint64(params[0].Int())
			from := params[1].String()
			to := params[2].String()
			result, err = wal.MintSwap(amount, from, to) // Returns uint64

		case "CurrentMint":
			result = wal.CurrentMint()

		case "TrustedMints":
			result = wal.TrustedMints()

		case "UpdateMintURL":
			if len(params) < 2 {
				err = fmt.Errorf("UpdateMintURL requires oldURL (string) and newURL (string) parameters")
				break
			}
			oldURL := params[0].String()
			newURL := params[1].String()
			err = wal.UpdateMintURL(oldURL, newURL)
			if err == nil {
				result = true // Indicate success
			}

		case "GetReceivePubkey":
			result = wal.GetReceivePubkey() // Returns *btcec.PublicKey

		case "Mnemonic":
			result = wal.Mnemonic()

		// --- Check and manage proof states ---
		case "CheckProofState":
			if len(params) < 2 {
				err = fmt.Errorf("CheckProofState requires mintURL (string) and proofs (stringified JSON) parameters")
				break
			}
			mintURL := params[0].String()
			proofsJson := params[1].String()

			var proofs cashu.Proofs
			err = json.Unmarshal([]byte(proofsJson), &proofs)
			if err != nil {
				err = fmt.Errorf("invalid proofs JSON: %w", err)
				break
			}

			result, err = wal.CheckProofState(mintURL, proofs)

		case "RemoveSpentProofs":
			err = wal.RemoveSpentProofs()
			if err == nil {
				result = true // Indicate success
			}

		case "ReclaimUnspentProofs":
			result, err = wal.ReclaimUnspentProofs() // Returns uint64

		// --- Quote Management Methods ---
		case "GetPendingMeltQuotes":
			result = wal.GetPendingMeltQuotes()

		case "GetMintQuotes":
			result = wal.GetMintQuotes()

		case "GetMintQuoteById":
			if len(params) < 1 {
				err = fmt.Errorf("GetMintQuoteById requires id (string) parameter")
				break
			}
			id := params[0].String()
			result = wal.GetMintQuoteById(id) // Returns *storage.MintQuote or nil

		case "GetMintQuoteByPaymentRequest":
			if len(params) < 1 {
				err = fmt.Errorf("GetMintQuoteByPaymentRequest requires request (string) parameter")
				break
			}
			request := params[0].String()
			result, err = wal.GetMintQuoteByPaymentRequest(request)

		case "GetMeltQuotes":
			result = wal.GetMeltQuotes()

		case "GetMeltQuoteById":
			if len(params) < 1 {
				err = fmt.Errorf("GetMeltQuoteById requires id (string) parameter")
				break
			}
			id := params[0].String()
			result = wal.GetMeltQuoteById(id) // Returns *storage.MeltQuote or nil

		// --- Shutdown ---
		case "Shutdown":
			// Acquire write lock for shutdown as it modifies the map
			Manager.mu.Lock()
			err = wal.Shutdown()
			if err == nil {
				delete(Manager.Wallets, walletKey) // Remove from map on successful shutdown
				result = true
			}
			Manager.mu.Unlock()

		default:
			err = fmt.Errorf("method '%s' not implemented or recognized", methodName)
		}

		// --- Invoke the callback if no error occurred during execution ---
		// Errors captured by `err` are handled by the deferred function
		if err == nil {
			jsResult, convertErr := resultToJSValue(result)
			if convertErr != nil {
				// If conversion fails, report that error via the callback
				err = fmt.Errorf("failed to convert result for method %s: %w", methodName, convertErr)
				// Let the defer handle this error
			} else {
				Manager.callback.Invoke(callId, jsResult)
			}
		}
	}() // End of goroutine

	// Return undefined immediately, as the operation is asynchronous
	return js.Undefined()
}

// --- Helper functions ---

// createJSError creates a JavaScript error object
func createJSError(message string) js.Value {
	return js.Global().Get("Error").New(message)
}

// resultToJSValue converts a Go result to a JavaScript value.
// Handles basic types, pointers, slices, maps, and uses JSON for structs.
func resultToJSValue(data any) (js.Value, error) {
	if data == nil {
		return js.Null(), nil
	}

	switch v := data.(type) {
	case string:
		return js.ValueOf(v), nil
	case int, int8, int16, int32: // Standard integer types
		return js.ValueOf(v), nil
	case int64:
		// JS numbers are IEEE 754 doubles, max safe integer is 2^53-1
		// Convert large int64 to string to avoid precision loss
		if v > 9007199254740991 || v < -9007199254740991 {
			return js.ValueOf(strconv.FormatInt(v, 10)), nil
		}
		return js.ValueOf(v), nil
	case uint, uint8, uint16, uint32: // Standard unsigned integer types
		return js.ValueOf(v), nil
	case uint64:
		// Convert large uint64 to string
		if v > 9007199254740991 {
			return js.ValueOf(strconv.FormatUint(v, 10)), nil
		}
		return js.ValueOf(v), nil
	case float32, float64:
		return js.ValueOf(v), nil
	case bool:
		return js.ValueOf(v), nil
	case map[string]uint64: // Specific handling for common map type
		jsMap := make(map[string]any)
		for key, val := range v {
			jsMap[key], _ = resultToJSValue(val) // Recursively convert values (ignore error here, handle outer)
		}
		return js.ValueOf(jsMap), nil
	case *btcec.PublicKey: // Handle specific pointer type if needed often
		if v == nil {
			return js.Null(), nil
		}
		return js.ValueOf(hex.EncodeToString(v.SerializeCompressed())), nil
	// Add cases for other common specific types if necessary
	// Example: []string
	case []string:
		jsArray := make([]interface{}, len(v))
		for i, s := range v {
			jsArray[i] = s
		}
		return js.ValueOf(jsArray), nil
	default:
		// Fallback to JSON marshaling for slices, structs, other maps, pointers etc.
		jsonData, err := json.Marshal(data)
		if err != nil {
			// Check for unsupported types explicitly if needed
			// E.g., if data is a channel or function
			return js.Undefined(), fmt.Errorf("failed to marshal result type %T to JSON: %w", data, err)
		}

		jsonString := string(jsonData)
		// Handle cases where marshal returns "null" for nil pointers/slices/maps
		if jsonString == "null" {
			return js.Null(), nil
		}

		// Parse the JSON string into a JavaScript object/array
		parseJSON := js.Global().Get("JSON").Get("parse")
		// Use try-catch in JS if parseJSON might throw, or handle error here if possible
		parsed := parseJSON.Invoke(jsonString)
		// We might want to check if 'parsed' is an error object from JS parse, but typically it throws.
		return parsed, nil
	}
}

// jsonToJSValue - DEPRECATED alias for backward compatibility if used elsewhere.
// Prefers resultToJSValue for new code.
func jsonToJSValue(data any) js.Value {
	val, err := resultToJSValue(data)
	if err != nil {
		// Maintain old behavior: return JS Error object directly on conversion failure
		return createJSError(err.Error())
	}
	return val
}
