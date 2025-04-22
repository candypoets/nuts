package types

import (
	"encoding/json"
	"fmt"
	"reflect"

	"github.com/elnosh/gonuts/cashu"
	"github.com/vmihailenco/msgpack/v5"
)

// ProofUnion represents either a cashu.Proof or cashu.ProofV4
type ProofUnion struct {
	// This field is just used to determine the type during unmarshaling
	Version int `json:"version,omitempty" msgpack:"version,omitempty"`

	// The actual proof, will be either cashu.Proof or cashu.ProofV4
	Proof interface{} `json:"-" msgpack:"-"`
}

// UnmarshalJSON implements custom JSON unmarshaling
func (p *ProofUnion) UnmarshalJSON(data []byte) error {
	// First try to parse as a generic map to inspect the version
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	// Determine the version/type of proof
	if version, ok := raw["version"].(float64); ok && version == 4 {
		// It's a V4 proof
		var proofV4 cashu.ProofV4
		if err := json.Unmarshal(data, &proofV4); err != nil {
			return err
		}
		p.Proof = proofV4
		p.Version = 4
	} else {
		// Assume it's a regular proof
		var proof cashu.Proof
		if err := json.Unmarshal(data, &proof); err != nil {
			return err
		}
		p.Proof = proof
		p.Version = 3 // Or whatever the default version is
	}

	return nil
}

// MarshalJSON implements custom JSON marshaling
func (p ProofUnion) MarshalJSON() ([]byte, error) {
	switch proof := p.Proof.(type) {
	case cashu.Proof:
		return json.Marshal(proof)
	case cashu.ProofV4:
		return json.Marshal(proof)
	default:
		return nil, fmt.Errorf("unknown proof type: %T", p.Proof)
	}
}

// EncodeMsgpack implements msgpack.CustomEncoder for msgpack encoding
func (p ProofUnion) EncodeMsgpack(enc *msgpack.Encoder) error {
	switch proof := p.Proof.(type) {
	case cashu.Proof:
		return enc.Encode(proof)
	case cashu.ProofV4:
		return enc.Encode(proof)
	default:
		return fmt.Errorf("unknown proof type: %T", p.Proof)
	}
}

// DecodeMsgpack implements msgpack.CustomDecoder for msgpack decoding
func (p *ProofUnion) DecodeMsgpack(dec *msgpack.Decoder) error {
	// First decode into a map to check the version
	var raw map[string]interface{}
	if err := dec.Decode(&raw); err != nil {
		return err
	}

	// Repack the map as msgpack for decoding into the appropriate type
	reencoded, err := msgpack.Marshal(raw)
	if err != nil {
		return err
	}

	// Determine the version/type of proof
	if version, ok := raw["version"].(int64); ok && version == 4 {
		// It's a V4 proof
		var proofV4 cashu.ProofV4
		if err := msgpack.Unmarshal(reencoded, &proofV4); err != nil {
			return err
		}
		p.Proof = proofV4
		p.Version = 4
	} else {
		// Assume it's a regular proof
		var proof cashu.Proof
		if err := msgpack.Unmarshal(reencoded, &proof); err != nil {
			return err
		}
		p.Proof = proof
		p.Version = 3
	}

	return nil
}

// GetProof returns the contained proof as either cashu.Proof or cashu.ProofV4
func (p ProofUnion) GetProof() interface{} {
	return p.Proof
}

// IsV4 returns true if the proof is a V4 proof
func (p ProofUnion) IsV4() bool {
	_, ok := p.Proof.(cashu.ProofV4)
	return ok
}

// AsProof returns the proof as cashu.Proof if it's that type
func (p ProofUnion) AsProof() (cashu.Proof, bool) {
	proof, ok := p.Proof.(cashu.Proof)
	return proof, ok
}

// AsProofV4 returns the proof as cashu.ProofV4 if it's that type
func (p ProofUnion) AsProofV4() (cashu.ProofV4, bool) {
	proofV4, ok := p.Proof.(cashu.ProofV4)
	return proofV4, ok
}

// Register the custom encoder/decoder with msgpack
func init() {
	// Register the custom encoder/decoder with msgpack
	// Note: We need to provide encoder and decoder functions instead of just the type
	msgpack.Register(reflect.TypeOf(ProofUnion{}),
		func(e *msgpack.Encoder, v reflect.Value) error {
			return e.EncodeValue(reflect.ValueOf(v.Interface().(ProofUnion)))
		},
		func(d *msgpack.Decoder, v reflect.Value) error {
			var pu ProofUnion
			if err := d.DecodeValue(reflect.ValueOf(&pu).Elem()); err != nil {
				return err
			}
			v.Set(reflect.ValueOf(pu))
			return nil
		})
}
