//go:build js && wasm
// +build js,wasm

package network

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"syscall/js"
	"time"

	"github.com/candypoets/nutscash/db"
	"github.com/candypoets/nutscash/logger"
	"github.com/candypoets/nutscash/parser"
	"github.com/fiatjaf/go-lnurl"
	"github.com/nbd-wtf/go-nostr"
	"github.com/rs/zerolog"
	// "github.com/vmihailenco/msgpack/v5" // Keep if needed for other callbacks
)

const (
	ZapCallbackInvoice  = "ZAP_INVOICE_RECEIVED"
	ZapCallbackError    = "ZAP_ERROR"
	DefaultZapRelaysTag = "wss://relay.damus.io,wss://relay.primal.net,wss://nos.lol"
	LNURLRequestTimeout = 20 * time.Second // Increased slightly for potentially slower LNURL servers
	NostrProfileTimeout = 10 * time.Second
)

// ZapRequestParams (remains the same)
type ZapRequestParams struct {
	ZapID              string   `json:"zapId"`
	RecipientNpub      string   `json:"recipientNpub"`
	AmountMillisats    int64    `json:"amountMillisats"`
	NoteIDToZapNostr   string   `json:"noteIdToZapNostr"`
	Comment            string   `json:"comment"`
	PreferredZapRelays []string `json:"preferredZapRelays"`
}

// ZapManager (remains largely the same, http client init might change if go-lnurl allows custom client globally)
type ZapManager struct {
	parser      *parser.Parser
	database    *db.NostrDB
	mutex       sync.Mutex
	log         zerolog.Logger
	callback    js.Func
	indexRelays []string
}

var customClient = &http.Client{
	Timeout: LNURLRequestTimeout,
}

var zapManager = &ZapManager{}

// NewZapManager creates a new ZapManager
func NewZapManager(p *parser.Parser, defaultRelays []string) {
	// Register the global wallet function handler
	js.Global().Set("zap", js.FuncOf(zapManager.InitiateZap))

	// Subscription callback
	zapManager.callback = js.FuncOf(func(this js.Value, args []js.Value) any {
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

	zapManager.log = logger.WithComponent("zap_manager")
	if len(defaultRelays) == 0 {
		defaultRelays = []string{"wss://purplepag.es", "wss://relay.nostr.band", "wss://nos.lol"}
	}

	lnurl.Client = customClient // Set the global client used by go-lnurl
	zapManager.indexRelays = defaultRelays
}

func (zm *ZapManager) InitiateZap(this js.Value, args []js.Value) any {
	// Ensure we have the required parameters
	if len(args) < 2 {
		zm.log.Error().Msg("Not enough arguments for zap function")
		return js.ValueOf("error: missing required parameters")
	}

	// Extract zapID from first argument
	zapID := args[0].String()

	// Parse the nostr event template from the second argument
	var template nostr.Event
	eventJSON := args[1].String()
	if err := json.Unmarshal([]byte(eventJSON), &template); err != nil {
		zm.log.Error().Err(err).Msg("Failed to parse zap request event JSON")
		zm.sendCallback(zapID, fmt.Sprintf("Failed to parse zap request: %v", err))
		return js.ValueOf("error: invalid event format")
	}

	// Process the zap request asynchronously
	go zm.Zap(zapID, template)

	// Return immediately to avoid blocking JS
	return js.ValueOf(true)
}

func (zm *ZapManager) Zap(zapID string, template nostr.Event) {
	parsed, _, err := zm.parser.ParseKind9734(template)
	if err != nil {
		zm.log.Error().Err(err).Msg("Failed to parse zap event")
		return
	}

	lnURL, err := zm.getLNURL(parsed.Recipient)
	if err != nil {
		zm.log.Error().Err(err).Str("recipient", parsed.Recipient).Msg("Failed to get LNURL from recipient")
		zm.sendCallback(zapID, fmt.Sprintf("Failed to get lightning address from recipient: %v", err))
		return
	}

	// Make initial LNURL request using lnurl.HandleLNURL to get callback URL etc.
	// lnurl.HandleLNURL can take a bech32 lnurl or a direct https lnurl.
	// It will also make the HTTP call internally using lnurl.Client.
	tag, lnurlParamsResponse, err := lnurl.HandleLNURL(lnURL)
	if err != nil {
		// Check if the error is an LNURLErrorResponse
		if lnurlErr, ok := err.(lnurl.LNURLErrorResponse); ok {
			zm.log.Error().Err(lnurlErr).Str("reason", lnurlErr.Reason).Str("rawLNURL", lnURL).Msg("LNURL service error on initial fetch")
			zm.sendCallback(zapID, fmt.Sprintf("Lightning service error: %s", lnurlErr.Reason))
		} else {
			zm.log.Error().Err(err).Str("rawLNURL", lnURL).Msg("Failed to handle LNURL")
			zm.sendCallback(zapID, "Failed to process Lightning Address/LNURL: "+err.Error())
		}
		return
	}

	if tag != "payRequest" {
		zm.log.Error().Str("tag", tag).Msg("LNURL is not a payRequest")
		zm.sendCallback(zapID, "Lightning Address/LNURL is not for payments (tag: "+tag+").")
		return
	}

	payParams, ok := lnurlParamsResponse.(lnurl.LNURLPayParams)
	if !ok {
		zm.log.Error().Msg("Failed to type assert LNURLParams to LNURLPayParams")
		zm.sendCallback(zapID, "Internal error: Unexpected LNURL parameter type.")
		return
	}
	zm.log.Debug().Str("zapID", zapID).Str("callback", payParams.Callback).Msg("Got LNURL pay params")

	err = zm.parser.Signer.SignEvent(&template)
	if err != nil {
		zm.log.Error().Err(err).Msg("Failed to sign zap request event")
		zm.sendCallback(zapID, fmt.Sprintf("Failed to sign zap request: %v", err))
		return
	}
	// Make LNURL callback request to get the invoice
	// The `payParams.Call` method in go-lnurl does not directly support adding the `nostr` parameter.
	// We need to construct the callback URL manually with the nostr event.
	invoice, err := zm.fetchInvoice(context.Background(), payParams, parsed.AmountMillisats, template)
	if err != nil {
		zm.log.Error().Err(err).Msg("Failed to fetch invoice from LNURL callback")
		zm.sendCallback(zapID, "Failed to get invoice: "+err.Error())
		return
	}

	zm.log.Info().Str("zapID", zapID).Msg("Successfully fetched Bolt11 invoice")
	zm.sendCallback(zapID, invoice)
}

// getLNURL gets either a bech32 LNURL or a direct HTTPS LNURL from profile
func (zm *ZapManager) getLNURL(pubkey string) (string, error) {
	event, ok := zm.database.QueryEvent(nostr.Filter{Kinds: []int{0}, Authors: []string{pubkey}})
	if !ok {
		return "", fmt.Errorf("profile not found for pubkey %s", pubkey)
	}
	var profileData struct {
		Lud16 string `json:"lud16"` // Lightning Address user@domain.com
		Lud06 string `json:"lud06"` // LNURL bech32 string (lnurl1...)
	}

	if err := json.Unmarshal([]byte(event.Content), &profileData); err != nil {
		return "", fmt.Errorf("failed to parse profile content for %s: %w", pubkey, err)
	}

	if profileData.Lud06 != "" { // Prefer lud06 if available, as it's direct
		return strings.ToUpper(profileData.Lud06), nil // go-lnurl expects uppercase for decode
	}
	if profileData.Lud16 != "" {
		name, domain, ok := lnurl.ParseInternetIdentifier(profileData.Lud16)
		if !ok {
			return "", fmt.Errorf("invalid lightning address format (lud16): %s", profileData.Lud16)
		}
		// Construct the .well-known URL manually
		return fmt.Sprintf("https://%s/.well-known/lnurlp/%s", domain, name), nil
	}

	return "", fmt.Errorf("no lud16 or lud06 found in profile for %s", pubkey)
}

// fetchInvoice is used because go-lnurl's payParams.Call doesn't take the nostr event directly for NIP-57
func (zm *ZapManager) fetchInvoice(ctx context.Context, payParams lnurl.LNURLPayParams, amountMillisats int64, zapRequestEvent nostr.Event) (string, error) {
	zapRequestJSON, err := json.Marshal(zapRequestEvent)
	if err != nil {
		return "", fmt.Errorf("failed to marshal zap request event: %w", err)
	}

	callbackURL, err := url.Parse(payParams.Callback)
	if err != nil {
		return "", fmt.Errorf("invalid callback URL %s: %w", payParams.Callback, err)
	}

	query := callbackURL.Query()
	query.Set("amount", strconv.FormatInt(amountMillisats, 10))
	query.Set("nostr", string(zapRequestJSON))
	if payParams.CommentAllowed > 0 && zapRequestEvent.Content != "" { // Some servers might pick up the comment query param too
		query.Set("comment", zapRequestEvent.Content)
	}
	callbackURL.RawQuery = query.Encode()

	zm.log.Debug().Str("url", callbackURL.String()).Msg("Calling LNURL callback for invoice")

	reqCtx, cancel := context.WithTimeout(ctx, LNURLRequestTimeout) // Use operation's context for cancellation
	defer cancel()

	// Use the global lnurl.Client which we configured, or zm.httpClient
	req, err := http.NewRequestWithContext(reqCtx, "GET", callbackURL.String(), nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request for LNURL callback: %w", err)
	}

	resp, err := lnurl.Client.Do(req) // Use the client configured for go-lnurl
	if err != nil {
		return "", fmt.Errorf("LNURL callback request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read LNURL callback response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		zm.log.Error().Int("status", resp.StatusCode).Str("body", string(body)).Msg("LNURL callback error response")
		var errResp lnurl.LNURLErrorResponse
		if json.Unmarshal(body, &errResp) == nil && errResp.Status == "ERROR" {
			return "", fmt.Errorf("LNURL service error: %s (status %d)", errResp.Reason, resp.StatusCode)
		}
		return "", fmt.Errorf("LNURL callback failed with status %d: %s", resp.StatusCode, string(body))
	}

	var invoiceResponse lnurl.LNURLPayValues // go-lnurl uses LNURLPayValues for the invoice response
	if err := json.Unmarshal(body, &invoiceResponse); err != nil {
		return "", fmt.Errorf("failed to parse invoice response from LNURL callback: %w. Body: %s", err, string(body))
	}

	if invoiceResponse.PR == "" { // PR is the Bolt11 invoice in LNURLPayValues
		var errResp lnurl.LNURLErrorResponse
		if json.Unmarshal(body, &errResp) == nil && errResp.Status == "ERROR" {
			return "", fmt.Errorf("LNURL service returned error: %s", errResp.Reason)
		}
		return "", fmt.Errorf("invoice response did not contain a Bolt11 invoice (pr). Body: %s", string(body))
	}

	// NIP-57: A zap service MAY include a nostrPubkey in the response if it intends to sign
	// zap receipts (kind:9735 events) with a key different from the pubkey of the zap recipient.
	// This isn't directly in LNURLPayValues struct, but some services might add it as an extra field.
	// For now, we focus on getting PR. If needed, inspect `invoiceResponse` for extra fields.
	return invoiceResponse.PR, nil
}

// --- Helper methods for JS callback and string conversions (remain the same) ---
// payload is either the invoice or the error
func (zm *ZapManager) sendCallback(zapID, payload string) {
	zm.callback.Invoke(ZapCallbackInvoice, zapID, payload)
}
