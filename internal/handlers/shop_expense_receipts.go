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
	"log/slog"
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
	maxReceiptUploadBytes     = 8 << 20
	maxReceiptFormBytes       = 10 << 20
	maxReceiptsPerShopExpense = 20
)

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func parseExpenseIDParam(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		return 0, fmt.Errorf("invalid id")
	}
	return id, nil
}

func parseReceiptIDParam(r *http.Request) (int64, error) {
	idStr := chi.URLParam(r, "receiptId")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil || id < 1 {
		return 0, fmt.Errorf("invalid receipt id")
	}
	return id, nil
}

func expenseReceiptImageURL(r *http.Request, expenseID, receiptID int64) string {
	prefix := "/api/admin"
	if strings.HasPrefix(r.URL.Path, "/api/operator/") {
		prefix = "/api/operator"
	}
	return fmt.Sprintf("%s/shop-expenses/%d/receipts/%d/image", prefix, expenseID, receiptID)
}

func receiptJSON(r *http.Request, expenseID int64, rec *store.ShopExpenseReceipt) map[string]any {
	return map[string]any{
		"id":              rec.ID,
		"shop_expense_id": rec.ShopExpenseID,
		"content_type":    rec.ContentType,
		"size_bytes":      rec.SizeBytes,
		"sha256":          rec.SHA256,
		"created_at":      rec.CreatedAt.UTC().Format(httpx.JSONTimeLayout),
		"image_url":       expenseReceiptImageURL(r, expenseID, rec.ID),
	}
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
		if httpx.RespondStoreNotFound(w, err, "Uitgave niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}

	n, err := d.Store.CountShopExpenseReceipts(r.Context(), expenseID)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	if n >= maxReceiptsPerShopExpense {
		httpx.JSONError(w, http.StatusBadRequest, "too_many_receipts", fmt.Sprintf("Maximaal %d bonfoto's per uitgave.", maxReceiptsPerShopExpense))
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

	if err := os.MkdirAll(d.Config.ReceiptsDir, 0o750); err != nil {
		slog.ErrorContext(r.Context(), "shop expense receipt upload: mkdir",
			slog.String("receipts_dir", d.Config.ReceiptsDir), slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kan opslagmap niet maken.")
		return
	}
	name, err := randomHex(16)
	if err != nil {
		slog.ErrorContext(r.Context(), "shop expense receipt upload: random id", slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Kan bestandsnaam niet maken.")
		return
	}
	filename := fmt.Sprintf("expense_%d_%s.jpg", expenseID, name)
	path := filepath.Join(d.Config.ReceiptsDir, filename)
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		slog.ErrorContext(r.Context(), "shop expense receipt upload: write file",
			slog.String("path", path), slog.Int64("expense_id", expenseID), slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan bonfoto mislukt (controleer schrijfrechten op RECEIPTS_DIR).")
		return
	}

	sha := sha256.Sum256(payload)
	rec, err := d.Store.InsertShopExpenseReceipt(
		r.Context(),
		expenseID,
		filename,
		contentType,
		int64(len(payload)),
		hex.EncodeToString(sha[:]),
	)
	if err != nil {
		_ = os.Remove(path)
		slog.ErrorContext(r.Context(), "shop expense receipt upload: insert metadata",
			slog.Int64("expense_id", expenseID), slog.Any("err", err))
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Opslaan metadata mislukt.")
		return
	}

	httpx.JSON(w, http.StatusCreated, receiptJSON(r, expenseID, rec))
}

func (d *Deps) APIShopExpenseReceiptMeta(w http.ResponseWriter, r *http.Request) {
	expenseID, err := parseExpenseIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	if _, err := d.Store.ShopExpenseByID(r.Context(), expenseID); err != nil {
		if httpx.RespondStoreNotFound(w, err, "Uitgave niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	recs, err := d.Store.ListShopExpenseReceiptsByExpenseID(r.Context(), expenseID)
	if err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	out := make([]map[string]any, 0, len(recs))
	for i := range recs {
		out = append(out, receiptJSON(r, expenseID, &recs[i]))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"receipts": out})
}

func (d *Deps) APIShopExpenseReceiptImage(w http.ResponseWriter, r *http.Request) {
	expenseID, err := parseExpenseIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_id", "Ongeldige uitgave.")
		return
	}
	receiptID, err := parseReceiptIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_receipt_id", "Ongeldige bonfoto.")
		return
	}
	rec, err := d.Store.ShopExpenseReceiptByID(r.Context(), receiptID)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Bonfoto niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	if rec.ShopExpenseID != expenseID {
		httpx.JSONError(w, http.StatusNotFound, "not_found", "Bonfoto niet gevonden.")
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
	receiptID, err := parseReceiptIDParam(r)
	if err != nil {
		httpx.JSONError(w, http.StatusBadRequest, "invalid_receipt_id", "Ongeldige bonfoto.")
		return
	}
	rec, err := d.Store.ShopExpenseReceiptByID(r.Context(), receiptID)
	if err != nil {
		if httpx.RespondStoreNotFound(w, err, "Bonfoto niet gevonden.") {
			return
		}
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Databasefout.")
		return
	}
	if rec.ShopExpenseID != expenseID {
		httpx.JSONError(w, http.StatusNotFound, "not_found", "Bonfoto niet gevonden.")
		return
	}
	if _, err := d.Store.DeleteShopExpenseReceiptByID(r.Context(), receiptID); err != nil {
		httpx.JSONError(w, http.StatusInternalServerError, "server_error", "Verwijderen metadata mislukt.")
		return
	}
	safeName := filepath.Clean(rec.StoragePath)
	if !strings.Contains(safeName, "..") && !filepath.IsAbs(safeName) {
		_ = os.Remove(filepath.Join(d.Config.ReceiptsDir, safeName))
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}
