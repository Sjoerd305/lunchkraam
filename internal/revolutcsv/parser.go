package revolutcsv

import (
	"bytes"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const fingerprintPrefix = "revolut-fp:"

// Row is one parsed Revolut-style statement line (debit/credit in payment currency).
type Row struct {
	CompletedDate time.Time
	AmountEUR     float64
	// BalanceEUR is the running account balance after this row when the export includes a balance column (e.g. Saldo). Nil when absent or unparseable.
	BalanceEUR  *float64
	Description string
	Type        string
	State       string
	Currency    string
	ExternalID  string
	Raw         map[string]string
}

// Parse reads a Revolut (or similar) CSV with a header row. Delimiter is auto-detected
// from the first line (comma vs semicolon). Headers are matched case- and space-insensitive
// and support common English/Dutch export names, for example:
//
//	Date completed (UTC), Voltooid op, Datum voltooid, Amount, Bedrag, Description,
//	Omschrijving, Type, State, Payment currency, ID, Transaction ID.
func Parse(r io.Reader) ([]Row, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	data = stripUTF8BOM(data)
	if len(data) == 0 {
		return nil, fmt.Errorf("empty file")
	}
	firstLineEnd := bytes.IndexByte(data, '\n')
	if firstLineEnd < 0 {
		firstLineEnd = len(data)
	}
	firstLine := data[:firstLineEnd]
	comma := bytes.Count(firstLine, []byte{','})
	semi := bytes.Count(firstLine, []byte{';'})
	delimiter := ','
	if semi > comma {
		delimiter = ';'
	}

	cr := csv.NewReader(bytes.NewReader(data))
	cr.LazyQuotes = true
	cr.TrimLeadingSpace = true
	cr.Comma = delimiter

	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	var out []Row
	for {
		rec, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read row: %w", err)
		}
		if rowIsEmpty(rec) {
			continue
		}
		parsed, perr := parseDataRow(header, rec)
		if perr != nil {
			return nil, perr
		}
		out = append(out, parsed)
	}
	return out, nil
}

func stripUTF8BOM(b []byte) []byte {
	if len(b) >= 3 && b[0] == 0xef && b[1] == 0xbb && b[2] == 0xbf {
		return b[3:]
	}
	return b
}

func normHeader(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "\ufeff")
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

func buildHeaderIndex(header []string) map[string]int {
	idx := make(map[string]int, len(header))
	for i, h := range header {
		idx[normHeader(h)] = i
	}
	return idx
}

func mapRow(header, rec []string) map[string]string {
	m := make(map[string]string, len(header))
	for i, name := range header {
		if i >= len(rec) {
			break
		}
		m[strings.TrimSpace(name)] = strings.TrimSpace(rec[i])
	}
	return m
}

func rowIsEmpty(rec []string) bool {
	for _, c := range rec {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

func firstNonEmpty(idx map[string]int, rec []string, keys ...string) string {
	for _, k := range keys {
		nk := normHeader(k)
		if j, ok := idx[nk]; ok && j < len(rec) {
			v := strings.TrimSpace(rec[j])
			if v != "" {
				return v
			}
		}
	}
	return ""
}

func parseDataRow(header, rec []string) (Row, error) {
	idx := buildHeaderIndex(header)
	// Prefer completed date; Dutch app exports often leave "Datum voltooid" empty for pending/cancelled rows — use Startdatum then.
	dateStr := firstNonEmpty(idx, rec,
		"Date completed (UTC)", "Date completed", "Completed Date", "Voltooid op", "Datum voltooid",
		"Completion date", "Date",
		"Startdatum", "Date started (UTC)", "Date started", "Started Date", "Begindatum",
	)
	if dateStr == "" {
		return Row{}, fmt.Errorf("row missing completed date (see revolutcsv header aliases)")
	}
	completed, err := parseFlexibleDate(dateStr)
	if err != nil {
		return Row{}, fmt.Errorf("date %q: %w", dateStr, err)
	}

	amountStr := firstNonEmpty(idx, rec, "Amount", "Bedrag", "Payment amount", "Betaald bedrag")
	if amountStr == "" {
		return Row{}, fmt.Errorf("row missing amount")
	}
	amount, err := parseAmount(amountStr)
	if err != nil {
		return Row{}, fmt.Errorf("amount %q: %w", amountStr, err)
	}

	balStr := firstNonEmpty(idx, rec, "Saldo", "Balance", "Running balance", "Account balance", "Rekening saldo")
	var balanceEUR *float64
	if balStr != "" {
		if b, berr := parseAmount(balStr); berr == nil {
			balanceEUR = &b
		}
	}

	desc := firstNonEmpty(idx, rec, "Description", "Beschrijving", "Omschrijving", "Reference", "Referentie", "Note")
	typ := firstNonEmpty(idx, rec, "Type", "Type transactie", "Transaction type")
	state := firstNonEmpty(idx, rec, "State", "Status")
	cur := firstNonEmpty(idx, rec, "Payment currency", "Currency", "Valuta")

	ext := firstNonEmpty(idx, rec, "ID", "Transaction ID", "Transactie-ID", "Revolut ID")

	return Row{
		CompletedDate: completed,
		AmountEUR:     amount,
		BalanceEUR:    balanceEUR,
		Description:   desc,
		Type:          typ,
		State:         state,
		Currency:      cur,
		ExternalID:    strings.TrimSpace(ext),
		Raw:           mapRow(header, rec),
	}, nil
}

func parseFlexibleDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	layouts := []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02 15:04:05 UTC",
		"02/01/2006",
		"02-01-2006",
		"2006-01-02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), nil
		}
	}
	// Dutch-style day-first with time
	if t, err := time.Parse("02/01/2006 15:04:05", s); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("unrecognized date format")
}

func parseAmount(s string) (float64, error) {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "")
	s = strings.ReplaceAll(s, "€", "")
	neg := false
	if strings.HasPrefix(s, "(") && strings.HasSuffix(s, ")") {
		neg = true
		s = strings.TrimPrefix(s, "(")
		s = strings.TrimSuffix(s, ")")
	}
	// European: 1.234,56
	if strings.Contains(s, ",") && strings.Contains(s, ".") {
		// If last sep is comma, treat comma as decimal
		if strings.LastIndex(s, ",") > strings.LastIndex(s, ".") {
			s = strings.ReplaceAll(s, ".", "")
			s = strings.ReplaceAll(s, ",", ".")
		} else {
			s = strings.ReplaceAll(s, ",", "")
		}
	} else if strings.Contains(s, ",") && !strings.Contains(s, ".") {
		// Only comma: EU decimals often use 1 or 2 fractional digits (e.g. 33,5 / 32,50). US thousands use one comma and exactly 3 digits after (1,234).
		i := strings.LastIndex(s, ",")
		fracLen := len(s) - i - 1
		switch {
		case fracLen == 1 || fracLen == 2:
			s = strings.ReplaceAll(s, ",", ".")
		case fracLen == 3 && strings.Count(s, ",") == 1:
			s = strings.ReplaceAll(s, ",", "")
		default:
			// Multiple commas (e.g. 1,234,567) or unusual lengths: strip all commas as grouping separators.
			s = strings.ReplaceAll(s, ",", "")
		}
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	if neg {
		v = -v
	}
	return v, nil
}

// FingerprintExternalID returns a stable external id when the statement row has no id column.
func FingerprintExternalID(completed time.Time, amount float64, description, typ string) string {
	sum := sha256.Sum256([]byte(strings.Join([]string{
		completed.UTC().Format(time.RFC3339),
		strconv.FormatFloat(amount, 'f', 4, 64),
		strings.TrimSpace(description),
		strings.TrimSpace(typ),
	}, "\x1e")))
	return fingerprintPrefix + hex.EncodeToString(sum[:])
}

// ValidUTF8 reports whether s is valid UTF-8 (Revolut CSV should be UTF-8).
func ValidUTF8(s string) bool {
	return utf8.ValidString(s)
}
