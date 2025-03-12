package parser

import (
	"github.com/candypoets/nutscash/types"
	"github.com/nbd-wtf/go-nostr"
)

type Kind7376Parsed struct{}

func (p *Parser) ParseKind7376(event nostr.Event) (*Kind7376Parsed, *[]types.Request, error) {
	return nil, nil, nil
}
