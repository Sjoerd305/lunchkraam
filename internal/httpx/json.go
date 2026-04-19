package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
)

// JSONTimeLayout is the canonical UTC timestamp layout for JSON APIs.
const JSONTimeLayout = "2006-01-02T15:04:05Z07:00"

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("httpx: json encode: %v", err)
	}
}

func JSONError(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, map[string]string{"error": code, "message": message})
}

// ReadJSON decodes a JSON object from the request body (size-capped with MaxBytesReader). On error it sends 400
// { error: invalid_json } and returns false.
func ReadJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBytes))
	if err := dec.Decode(dst); err != nil {
		JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
		return false
	}
	return true
}

// ReadJSONAllowEmpty is like [ReadJSON] but treats an empty body (io.EOF) as a non-error, leaving dst unchanged.
// Use for endpoints where an empty or omitted JSON object is valid.
func ReadJSONAllowEmpty(w http.ResponseWriter, r *http.Request, maxBytes int64, dst any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBytes))
	err := dec.Decode(dst)
	if err == nil {
		return true
	}
	if errors.Is(err, io.EOF) {
		return true
	}
	JSONError(w, http.StatusBadRequest, "invalid_json", "Ongeldige aanvraag.")
	return false
}
