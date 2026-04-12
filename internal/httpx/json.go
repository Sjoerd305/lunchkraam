package httpx

import (
	"encoding/json"
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
