package wallet

import (
	"encoding/hex"
	"fmt"
	"math"
	"syscall/js"

	"github.com/btcsuite/btcd/btcec/v2"
	"github.com/elnosh/gonuts/cashu/nuts/nut11"
)

// parseP2PKTags attempts to parse a js.Value representing NUT-11 P2PKTags.
// It returns the parsed tags or an error if parsing fails.
// It returns nil, nil if the input js.Value is null or undefined.
// NOTE: This function definition should be placed outside the current scope,
// for example, at the top level of the file or alongside other helper functions.
func parseP2PKTags(tagsJS js.Value) (*nut11.P2PKTags, error) {
	if tagsJS.IsNull() || tagsJS.IsUndefined() {
		return nil, nil // No tags provided, not an error
	}

	if tagsJS.Type() != js.TypeObject {
		return nil, fmt.Errorf("tags parameter must be an object, null, or undefined, got %s", tagsJS.Type().String())
	}

	tags := &nut11.P2PKTags{}
	var err error // To capture errors from helper

	// Helper function to parse public key arrays
	parsePubkeys := func(jsValue js.Value, fieldName string) ([]*btcec.PublicKey, error) {
		// Check if the property exists and is an array
		if jsValue.IsUndefined() || jsValue.IsNull() {
			return nil, nil // Field not present or null, skip
		}
		if !js.Global().Get("Array").Call("isArray", jsValue).Bool() {
			return nil, fmt.Errorf("expected array for %s, got %s", fieldName, jsValue.Type().String())
		}

		length := jsValue.Length()
		pubkeys := make([]*btcec.PublicKey, 0, length)
		for i := 0; i < length; i++ {
			pkHexJS := jsValue.Index(i)
			if pkHexJS.Type() != js.TypeString {
				return nil, fmt.Errorf("expected string for pubkey hex in %s[%d], got %s", fieldName, i, pkHexJS.Type().String())
			}
			pkHex := pkHexJS.String()
			pkBytes, pkErr := hex.DecodeString(pkHex)
			if pkErr != nil {
				return nil, fmt.Errorf("invalid pubkey hex in %s[%d]: %w", fieldName, i, pkErr)
			}
			pubkey, pkErr := btcec.ParsePubKey(pkBytes)
			if pkErr != nil {
				return nil, fmt.Errorf("invalid pubkey format in %s[%d]: %w", fieldName, i, pkErr)
			}
			pubkeys = append(pubkeys, pubkey)
		}
		return pubkeys, nil
	}

	// Parse Sigflag
	if sigflagJS := tagsJS.Get("sigflag"); !sigflagJS.IsUndefined() && !sigflagJS.IsNull() {
		if sigflagJS.Type() == js.TypeString {
			tags.Sigflag = sigflagJS.String()
		} else {
			return nil, fmt.Errorf("invalid type for sigflag: expected string, got %s", sigflagJS.Type().String())
		}
	}

	// Parse NSigs
	if nSigsJS := tagsJS.Get("nSigs"); !nSigsJS.IsUndefined() && !nSigsJS.IsNull() {
		if nSigsJS.Type() == js.TypeNumber {
			tags.NSigs = nSigsJS.Int()
		} else {
			return nil, fmt.Errorf("invalid type for nSigs: expected number, got %s", nSigsJS.Type().String())
		}
	}

	// Parse Pubkeys
	tags.Pubkeys, err = parsePubkeys(tagsJS.Get("pubkeys"), "tags.pubkeys")
	if err != nil {
		return nil, err // Propagate error immediately
	}

	// Parse Locktime
	if locktimeJS := tagsJS.Get("locktime"); !locktimeJS.IsUndefined() && !locktimeJS.IsNull() {
		if locktimeJS.Type() == js.TypeNumber {
			// Use Float() for potentially large JS numbers and check range
			locktimeFloat := locktimeJS.Float()
			if locktimeFloat < float64(math.MinInt64) || locktimeFloat > float64(math.MaxInt64) {
				return nil, fmt.Errorf("locktime value %f out of range for int64", locktimeFloat)
			}
			tags.Locktime = int64(locktimeFloat)
		} else {
			return nil, fmt.Errorf("invalid type for locktime: expected number, got %s", locktimeJS.Type().String())
		}
	}

	// Parse Refund Pubkeys
	tags.Refund, err = parsePubkeys(tagsJS.Get("refund"), "tags.refund")
	if err != nil {
		return nil, err // Propagate error immediately
	}

	return tags, nil
}
