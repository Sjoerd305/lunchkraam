package store

import (
	"fmt"
	"strings"
)

const (
	CardKindTosti     = "tosti"
	CardKindAvondeten = "avondeten"
)

// NormalizeCardKind returns a valid card kind; empty string defaults to tosti.
func NormalizeCardKind(s string) (string, error) {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" || s == CardKindTosti {
		return CardKindTosti, nil
	}
	if s == CardKindAvondeten {
		return CardKindAvondeten, nil
	}
	return "", fmt.Errorf("invalid card kind")
}
