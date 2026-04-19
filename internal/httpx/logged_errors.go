package httpx

import (
	"log/slog"
	"net/http"
)

// RespondInternalStoreError logs err with a stable operation name, then writes the generic
// JSON 500 used for unexpected store failures ("Databasefout.").
func RespondInternalStoreError(w http.ResponseWriter, r *http.Request, operation string, err error) {
	slog.ErrorContext(r.Context(), operation, slog.Any("err", err))
	JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
}
