package store

import "context"

// TostiKindQuantity is delivered count for one bread/filling in a calendar year.
type TostiKindQuantity struct {
	Bread    string
	Filling  string
	Quantity int64
}

// AdminTostiDeliveredQuantitiesByMonth returns delivered quantities per month (Amsterdam calendar, year).
func (s *Store) AdminTostiDeliveredQuantitiesByMonth(ctx context.Context, year int) ([12]int64, error) {
	var out [12]int64
	rows, err := s.pool.Query(ctx, `
SELECT EXTRACT(MONTH FROM (delivered_at AT TIME ZONE 'Europe/Amsterdam'))::int AS m,
       COALESCE(SUM(quantity), 0)::bigint
FROM tosti_orders
WHERE status = 'delivered'
  AND delivered_at IS NOT NULL
  AND EXTRACT(YEAR FROM (delivered_at AT TIME ZONE 'Europe/Amsterdam'))::int = $1
GROUP BY 1
ORDER BY 1`, year)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var m int
		var q int64
		if err := rows.Scan(&m, &q); err != nil {
			return out, err
		}
		if m >= 1 && m <= 12 {
			monthIndex := m - 1
			out[monthIndex] = q // #nosec G602 -- monthIndex is validated to be within 0..11
		}
	}
	return out, rows.Err()
}

// AdminTostiDeliveredByKind returns delivered counts by bread and filling, highest first.
func (s *Store) AdminTostiDeliveredByKind(ctx context.Context, year int) ([]TostiKindQuantity, error) {
	rows, err := s.pool.Query(ctx, `
SELECT bread::text, filling::text, COALESCE(SUM(quantity), 0)::bigint
FROM tosti_orders
WHERE status = 'delivered'
  AND delivered_at IS NOT NULL
  AND EXTRACT(YEAR FROM (delivered_at AT TIME ZONE 'Europe/Amsterdam'))::int = $1
GROUP BY bread, filling
ORDER BY SUM(quantity) DESC, bread, filling`, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []TostiKindQuantity
	for rows.Next() {
		var r TostiKindQuantity
		if err := rows.Scan(&r.Bread, &r.Filling, &r.Quantity); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// AdminTostiDeliveredYearQuantity is total delivered tosti count for the year (Amsterdam).
func (s *Store) AdminTostiDeliveredYearQuantity(ctx context.Context, year int) (int64, error) {
	var q int64
	err := s.pool.QueryRow(ctx, `
SELECT COALESCE(SUM(quantity), 0)::bigint
FROM tosti_orders
WHERE status = 'delivered'
  AND delivered_at IS NOT NULL
  AND EXTRACT(YEAR FROM (delivered_at AT TIME ZONE 'Europe/Amsterdam'))::int = $1`, year).Scan(&q)
	if err != nil {
		return 0, err
	}
	return q, nil
}

// TostiDeliveredQuantityOnAmsterdamCalendarDate sums delivered quantity for yyyy-mm-dd (Amsterdam date).
func (s *Store) TostiDeliveredQuantityOnAmsterdamCalendarDate(ctx context.Context, yyyyMMdd string) (int64, error) {
	var q int64
	err := s.pool.QueryRow(ctx, `
SELECT COALESCE(SUM(quantity), 0)::bigint
FROM tosti_orders
WHERE status = 'delivered'
  AND delivered_at IS NOT NULL
  AND (delivered_at AT TIME ZONE 'Europe/Amsterdam')::date = $1::date`, yyyyMMdd).Scan(&q)
	if err != nil {
		return 0, err
	}
	return q, nil
}
