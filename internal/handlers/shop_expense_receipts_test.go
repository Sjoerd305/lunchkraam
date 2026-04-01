package handlers

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"net/http/httptest"
	"testing"
)

func TestDecodeAndCompressReceipt_ValidPNG(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 4, 4))
	img.Set(0, 0, color.RGBA{R: 255, A: 255})
	var in bytes.Buffer
	if err := png.Encode(&in, img); err != nil {
		t.Fatalf("png encode: %v", err)
	}

	out, contentType, err := decodeAndCompressReceipt(bytes.NewReader(in.Bytes()))
	if err != nil {
		t.Fatalf("decodeAndCompressReceipt: %v", err)
	}
	if len(out) == 0 {
		t.Fatalf("expected encoded jpeg bytes")
	}
	if contentType != "image/jpeg" {
		t.Fatalf("unexpected contentType: %q", contentType)
	}
}

func TestDecodeAndCompressReceipt_InvalidImage(t *testing.T) {
	_, _, err := decodeAndCompressReceipt(bytes.NewReader([]byte("not-an-image")))
	if err == nil {
		t.Fatalf("expected error for invalid image")
	}
}

func TestExpenseReceiptImageURL(t *testing.T) {
	adminReq := httptest.NewRequest("GET", "/api/admin/shop-expenses/10/receipt", nil)
	if got := expenseReceiptImageURL(adminReq, 10); got != "/api/admin/shop-expenses/10/receipt/image" {
		t.Fatalf("unexpected admin url: %q", got)
	}
	operatorReq := httptest.NewRequest("GET", "/api/operator/shop-expenses/11/receipt", nil)
	if got := expenseReceiptImageURL(operatorReq, 11); got != "/api/operator/shop-expenses/11/receipt/image" {
		t.Fatalf("unexpected operator url: %q", got)
	}
}
