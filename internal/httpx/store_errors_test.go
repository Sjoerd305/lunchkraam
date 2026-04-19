package httpx

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"lunchkraam/internal/store"
)

func TestWriteBankCreditStoreError_waiveNotOpenMessage(t *testing.T) {
	rec := httptest.NewRecorder()
	if !WriteBankCreditStoreError(rec, store.ErrBankCreditNotOpen, true) {
		t.Fatal("expected mapped response")
	}
	var body struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Error != "not_open" {
		t.Fatalf("error code: got %q", body.Error)
	}
	if body.Message != "Alleen open regels kunnen zo worden afgehandeld." {
		t.Fatalf("message: got %q", body.Message)
	}
}

func TestWriteBankCreditStoreError_suggestNotOpenMessage(t *testing.T) {
	rec := httptest.NewRecorder()
	if !WriteBankCreditStoreError(rec, store.ErrBankCreditNotOpen, false) {
		t.Fatal("expected mapped response")
	}
	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	want := "Deze bankregel is niet meer open (al gekoppeld of afgehandeld)."
	if body.Message != want {
		t.Fatalf("message: got %q want %q", body.Message, want)
	}
}

func TestWriteBankCreditStoreError_unknown(t *testing.T) {
	rec := httptest.NewRecorder()
	if WriteBankCreditStoreError(rec, errors.New("db exploded"), false) {
		t.Fatal("expected no mapping")
	}
	if rec.Body.Len() != 0 {
		t.Fatal("expected no response body")
	}
}
