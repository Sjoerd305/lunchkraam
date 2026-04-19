package handlers

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/revolutcsv"
)

// readRevolutShopExpenseCSV reads multipart form data and parses the Revolut CSV.
// On failure it writes a JSON error to w and returns nil, false.
// logCtxMessage is used with WarnContext when CSV parsing fails.
func readRevolutShopExpenseCSV(w http.ResponseWriter, r *http.Request, logCtxMessage string) ([]revolutcsv.Row, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRevolutCSVFormBytes)
	if err := r.ParseMultipartForm(maxRevolutCSVFormBytes); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_upload", "Upload is ongeldig of te groot (max. 8 MB).")
		return nil, false
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "missing_file", "Kies een CSV-bestand.")
		return nil, false
	}
	defer file.Close()

	raw, err := io.ReadAll(file)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_upload", "Bestand kon niet worden gelezen.")
		return nil, false
	}

	rows, err := revolutcsv.Parse(bytes.NewReader(raw))
	if err != nil {
		slog.WarnContext(r.Context(), logCtxMessage, slog.Any("err", err))
		httpx.JSONError(w, http.StatusBadRequest, "import_failed", "CSV kon niet worden gelezen. Controleer het bestand.")
		return nil, false
	}
	return rows, true
}
