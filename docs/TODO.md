# TODO — financiën lunchkraam / Revolut

## Principe: waarheid vs controle

*(Ontwerprichtlijn — geen open taken; gedrag zit in o.a. Revolut-import, bankkoppelingen en admin-rapportage.)*

- **Digitale geldstromen op de Revolut-rekening:** alleen vastleggen via **Revolut-import** (één bron van waarheid voor wat er echt op de rekening gebeurt).
- **Verkopen (kaarten, tellingen):** wél **bijhouden**, maar **niet** als financiële waarheid naast de bank — gebruiken als **controle op de werkelijkheid**: lopen we **voor** op de rekening, **achter**, of is het **synchroon** met wat Revolut toont?
- **Handmatig registreren** blijft zinvol voor wat **niet** (of niet betrouwbaar) via Revolut terugkomt: contant, correcties, uitzonderingen — zonder digitale inkomsten dubbel te boeken.

## Revolut vs tostikraam-verkoop

- [x] **Saldo / import:** Revolut-CSV-import (uitgaven + optioneel inkomsten als bank-omzet), saldo uit afschrift-kolom op **Boodschappen** (`AdminShopExpensesPage`), openstaande bankregels koppelen op **Financiën** (`AdminFinancePage`).
- [ ] **Saldo vs verwachting in één beeld:** expliciet **voor / achter / synchroon** tov **verwachte omzet** (cumulatief of per periode) — nu wel **maandvergelijking** Revolut-credits vs app-omzet via CLI: `cmd/revolut-import` (reconcile-modus), nog geen dedicated in-app rapport met die legenda.
- [x] **Avondeten vs lunchkraam:** zelfde rekening, **apart doel** (`lunchkraam` / `avondeten`) bij import en handmatige boekingen; omzet- en uitgaven**split** in dashboard, grafieken, overzichten en import-voorbeeld.

## Losse posten (buiten digitale Revolut-lijn)

- [x] **Handmatige uitgaven / kas:** contante en digitale uitgave + **contant bij kas** op **Boodschappen**; dubbele import vs handmatige bon → **wachtrij** (pending reviews).
- [ ] **Overige correcties** expliciet modelleren (bijv. terugbetalingen, afspraken andere speltak/gasten) als jullie dat **niet** genoeg vinden onder bestaande boekingen + “bank zonder verkoop” op Financiën — productkeuze / korte workflow in UI.
- [ ] Optioneel: **toelichting of tags** bij importregels (bijv. afwijkende Tikkie-groep) als **administratieve context**, zonder een tweede gelijke boeking te maken.

## Nog uit te werken in product / UI

- [ ] **Verkoopcontrole-scherm** (alles in één scherm met legenda *voor/achter/synchroon*): deels gedekt door **Dashboard** + **Overzichten** + **Financiën** + CLI-reconcile; nog geen aparte “controle”-pagina.
- [ ] **Documentatie vrijwilligers:** kort **stappenplan** (import vs handmatig, waar saldo staat, hoe koppelen) — nu vooral in UI-teksten en [docs/ARCHITECTURE.md](ARCHITECTURE.md); geen aparte handleiding.

## Code health — backend

*Last reviewed: 2026-04-19 (follow-up scan)*

- [x] Gedeelde **EUR cent-rounding** helper (`internal/money.RoundEUR`; vervangt `math.Round(v*100)/100` bij JSON-uitvoer en rapportage).
- [x] Gedeelde **JSON body decode**: `httpx.ReadJSON` / `httpx.ReadJSONAllowEmpty` i.p.v. overal `json.NewDecoder(http.MaxBytesReader(…))` + uniforme 400 bij parse-fout.
- [x] **Store error → HTTP** centraal in [internal/httpx/store_errors.go](internal/httpx/store_errors.go) (`RespondStoreNotFound`, `WriteBankCreditStoreError`, tosti/kaart/avondeten/local-password helpers); handlers roepen die aan i.p.v. lange `errors.Is`-ketens.
- [x] **Logging**: `log/slog` met structured fields in handlers + [internal/httpx/json.go](internal/httpx/json.go); `slog.SetDefault` in [cmd/server/main.go](cmd/server/main.go); server-startupmeldingen (dist, listen, shutdown, bonfoto-map) ook via `slog`. (`log` alleen nog voor `log.Fatalf` bij fatale startup.)
- **HTTP-handler tests:** store→HTTP mapping heeft al [internal/httpx/store_errors_test.go](internal/httpx/store_errors_test.go); brede route-dekking via `httptest` is optioneel voor regressies op auth/rate-limit — laag prioriteit tenzij API-contract expliciet vastgelegd moet worden.

## Code health — frontend

*Last reviewed: 2026-04-19 (follow-up scan)*

- [x] Gedeelde **`formatEUR`** / **`roundCents`** in [frontend/src/utils/formatMoney.ts](frontend/src/utils/formatMoney.ts) (`Intl.NumberFormat` NL + EUR).
- [x] **Admin dashboard**-euro’s via `formatEUR` (geen losse `toFixed(2)`-strings); **buiten admin** staan nog losse `€`-strings op o.a. Buy/Dashboard — zie *Production backlog — code*.
- [x] **Admin grafieken** (`AdminSalesCharts`): `roundCents` i.p.v. herhaalde `Math.round(x*100)/100`.
- [x] **Zod** — response- en payload-types in `api.ts` via `z.infer<typeof …Schema>` gekoppeld aan [frontend/src/api.schemas.ts](frontend/src/api.schemas.ts) (sub-schema’s geëxporteerd waar nodig).
- [x] Optioneel: **`apiRequest`-factory** (`apiJson` / `apiVoid` / `apiFormJson` in [frontend/src/apiRequest.ts](frontend/src/apiRequest.ts)) — `api.ts` gebruikt dit centraal.
- [x] Optioneel: **TanStack Query** — `QueryClientProvider` in [frontend/src/main.tsx](frontend/src/main.tsx); admin-pagina’s met server state gebruiken `useQuery` / `invalidateQueries` (o.a. dashboard, requests, users, settings, sales charts, expenses overview, finance, shop expenses).

### Code review / vervolg (korte scan 2026-04-19)

- **Admin-fetchpatroon:** geen resterende `useEffect`+`void api.*`-loads op admin-pagina’s; mutaties invalidaten gerichte `queryKeys`.
- [x] **Jaarlijst + geselecteerd jaar (admin):** gedeelde hook [frontend/src/hooks/useAdminSalesYearsSelect.ts](frontend/src/hooks/useAdminSalesYearsSelect.ts) voor `salesYears` + state/sync + foutpad; gebruikt op Financiën, uitgaven-overzicht, boodschappen en **admin grafieken** (`AdminSalesCharts`, met `emptyYearsListBehavior` waar lege API-lijst het vorige jaar behoudt).
- [x] **Jaar-dropdown opties:** pure helper [frontend/src/utils/adminYearSelectOptions.ts](frontend/src/utils/adminYearSelectOptions.ts) + [unit test](frontend/src/utils/adminYearSelectOptions.test.ts); vervangt copy-paste `useMemo` op dezelfde admin-pagina’s.
- **Buiten admin:** `KraamPage`, `CardsPage`, `BuyPage`, `OrderTostiPage` houden nog **lokale state + handmatige refresh**; Query is daar optioneel tot het patroon lastig wordt.
- **CLI** (`cmd/revolut-import`): nog `log.Printf` — acceptabel voor een losstaand commando; serverpad blijft `slog`.
- [x] **Admin query-fout → alert/toast:** gedeelde hook [frontend/src/hooks/useQueryErrorAlert.ts](frontend/src/hooks/useQueryErrorAlert.ts) i.p.v. copy-paste `useEffect` op admin-pagina’s (incl. Financiën met meerdere queries).

### Production backlog — code *(scan / plan 2026-04-19; uitvoering 2026-04-19)*

**Backend**

- [x] **Pending import merge:** transactionele merge via [internal/store/pending_import_reviews.go](internal/store/pending_import_reviews.go) (`MergePendingImportReview`); integratie-check [internal/store/pending_import_reviews_merge_test.go](internal/store/pending_import_reviews_merge_test.go) met `TEST_DATABASE_URL`.
- [x] **Generieke 500 + DB-fouten:** [internal/httpx/logged_errors.go](internal/httpx/logged_errors.go) (`RespondInternalStoreError`) op `"Databasefout."`-paden in handlers.
- [x] **Bank credit store:** types/errors + `scanBankCreditListRow` naar [internal/store/bank_credit_types.go](internal/store/bank_credit_types.go) (lijst-SQL blijft in `bank_credit_reconciliation.go`).
- [ ] **Nog te splitsen / afsmullen:** o.a. [internal/handlers/shop_expenses_revolut_import.go](internal/handlers/shop_expenses_revolut_import.go), [internal/handlers/api_admin_sales.go](internal/handlers/api_admin_sales.go) (DTO-rounding helper), [internal/store/shop_expenses.go](internal/store/shop_expenses.go).

**Frontend**

- [x] **`useQueryErrorAlert`:** zie hook hierboven + admin-pagina’s.
- [x] **Card-kind labels/badges:** [frontend/src/utils/cardKindPresentation.ts](frontend/src/utils/cardKindPresentation.ts); Kraam re-exporteert vanuit [frontend/src/pages/kraam/kraamFormat.ts](frontend/src/pages/kraam/kraamFormat.ts).
- [x] **Lidgerichte + chart-tick euro’s:** `formatEURFromString` / `formatEUR` op Buy, Dashboard, admin-grafieken ([frontend/src/utils/formatMoney.ts](frontend/src/utils/formatMoney.ts)).
- [x] **TanStack Query (deels):** `queryKeys.member` + [frontend/src/pages/CardsPage.tsx](frontend/src/pages/CardsPage.tsx) op Query; [frontend/src/pages/BuyPage.tsx](frontend/src/pages/BuyPage.tsx) invalideert `myCards` na mutaties.
- [ ] (Optioneel) **Kraam + OrderTosti:** Query + WebSocket `invalidateQueries`.
- [ ] (Optioneel) **Zod:** WebSocket-payload in `useTostiRealtime`; error-JSON in `apiRequest.parseError`.

## Libraries vs zelf bouwen (richtlijn)

- **Liever een dependency** wanneer die een hele bug-klasse of herhaald boilerplate oplost (bijv. **TanStack Query** voor server state; een CSV-library alleen als `internal/revolutcsv` tekort schiet).
- **Liever stdlib of kleine interne helper** voor beknopte dingen: centafronding, één `DecodeJSON`, duidelijke foutmapping — zolang `float64` en JSON acceptabel blijven voor jullie use case.
- **Afronding / boekhoudkundige exactheid:** pas **decimal**-achtige packages overwegen (bijv. `shopspring/decimal`) als float-problemen echt spelen, niet “voor netjes”.
- **Vermijden:** zware UI-kits of ORM’s tussentijds invoeren zolang **Chi + pgx + handgeschreven SQL** en de huidige stack al bij de codebase passen.
