package handlers

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"lunchkraam/internal/httpx"
	"lunchkraam/internal/store"
)

const (
	maxReceiptUploadBytes = 8 << 20
	maxReceiptFormBytes   = 10 << 20
)

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func parseExpenseIDParam(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		return 0, fmt.Errorf("invalid id")
	}
	return id, nil
}

func expenseReceiptImageURL(r *http.Request, expenseID int64) string {
	prefix := "/api/admin"
	if strings.HasPrefix(r.URL.Path, "/api/operator/") {
		prefix = "/api/operator"
	}
	return fmt.Sprintf("%s/shop-expenses/%d/receipt/image", prefix, expenseID)
}

func decodeAndCompressReceipt(src io.Reader) ([]byte, string, error) {
	img, _, err := image.Decode(src)
	if err != nil {
		return nil, "", fmt.Errorf("decode image: %w", err)
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 78}); err != nil {
		return nil, "", fmt.Errorf("encode jpeg: %w", err)
	}
	if out.Len() == 0 {
		return nil, "", fmt.Errorf("empty encoded image")
	}
	return out.Bytes(), "image/jpeg", nil
}

func (d *Deps) APIShopExpenseReceiptUpload(w http.ResponseWriter, r *http.Request) {
	expenseID, err := parseExpenseIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	if _, err := d.Store.ShopExpenseByID(r.Context(), expenseID); err != nil {
		if err == store.ErrNotFound {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Uitgave niet gevonden.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxReceiptFormBytes)
	if err := r.ParseMultipartForm(maxReceiptFormBytes); err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_upload", "Upload is ongeldig of te groot.")
		return
	}
	file, _, err := r.FormFile("receipt")
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "missing_file", "Upload een bonfoto.")
		return
	}
	defer file.Close()

	limited := io.LimitReader(file, maxReceiptUploadBytes+1)
	payload, contentType, err := decodeAndCompressReceipt(limited)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_image", "Alleen geldige bonfoto's zijn toegestaan.")
		return
	}
	if len(payload) > maxReceiptUploadBytes {
		httpx.JSONError(w, http.StatusBadRequest, "too_large", "Bonfoto is te groot.")
		return
	}

	if err := os.MkdirAll(d.Config.ReceiptsDir, 0o755); err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kan opslagmap niet maken.")
		return
	}
	name, err := randomHex(16)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kan bestandsnaam niet maken.")
		return
	}
	filename := fmt.Sprintf("expense_%d_%s.jpg", expenseID, name)
	path := filepath.Join(d.Config.ReceiptsDir, filename)
	if err := os.WriteFile(path, payload, 0o644); err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan bonfoto mislukt.")
		return
	}

	prev, prevErr := d.Store.ShopExpenseReceiptByExpenseID(r.Context(), expenseID)
	if prevErr != nil && prevErr != store.ErrNotFound {
		_ = os.Remove(path)
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	sha := sha256.Sum256(payload)
	rec, err := d.Store.UpsertShopExpenseReceipt(
		r.Context(),
		expenseID,
		filename,
		contentType,
		int64(len(payload)),
		hex.EncodeToString(sha[:]),
	)
	if err != nil {
		_ = os.Remove(path)
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan metadata mislukt.")
		return
	}
	if prevErr == nil && prev != nil && prev.StoragePath != filename {
		_ = os.Remove(filepath.Join(d.Config.ReceiptsDir, filepath.Clean(prev.StoragePath)))
	}

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"id":              rec.ID,
		"shop_expense_id": rec.ShopExpenseID,
		"content_type":    rec.ContentType,
		"size_bytes":      rec.SizeBytes,
		"sha256":          rec.SHA256,
		"created_at":      rec.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		"image_url":       expenseReceiptImageURL(r, expenseID),
	})
}

func (d *Deps) APIShopExpenseReceiptMeta(w http.ResponseWriter, r *http.Request) {
	expenseID, err := parseExpenseIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	rec, err := d.Store.ShopExpenseReceiptByExpenseID(r.Context(), expenseID)
	if err != nil {
		if err == store.ErrNotFound {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Geen bonfoto voor deze uitgave.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"id":              rec.ID,
		"shop_expense_id": rec.ShopExpenseID,
		"content_type":    rec.ContentType,
		"size_bytes":      rec.SizeBytes,
		"sha256":          rec.SHA256,
		"created_at":      rec.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		"image_url":       expenseReceiptImageURL(r, expenseID),
	})
}

func (d *Deps) APIShopExpenseReceiptImage(w http.ResponseWriter, r *http.Request) {
	expenseID, err := parseExpenseIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	rec, err := d.Store.ShopExpenseReceiptByExpenseID(r.Context(), expenseID)
	if err != nil {
		if err == store.ErrNotFound {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Geen bonfoto voor deze uitgave.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	safeName := filepath.Clean(rec.StoragePath)
	if strings.Contains(safeName, "..") || filepath.IsAbs(safeName) {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Ongeldig opslagpad.")
		return
	}
	path := filepath.Join(d.Config.ReceiptsDir, safeName)
	http.ServeFile(w, r, path)
}

func (d *Deps) APIShopExpenseReceiptDelete(w http.ResponseWriter, r *http.Request) {
	expenseID, err := parseExpenseIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	rec, err := d.Store.ShopExpenseReceiptByExpenseID(r.Context(), expenseID)
	if err != nil {
		if err == store.ErrNotFound {
			httpx.JSONError(w, http.StatusNotFound, "not_found", "Geen bonfoto voor deze uitgave.")
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	if err := d.Store.DeleteShopExpenseReceipt(r.Context(), expenseID); err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verwijderen metadata mislukt.")
		return
	}
	safeName := filepath.Clean(rec.StoragePath)
	if !strings.Contains(safeName, "..") && !filepath.IsAbs(safeName) {
		_ = os.Remove(filepath.Join(d.Config.ReceiptsDir, safeName))
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
