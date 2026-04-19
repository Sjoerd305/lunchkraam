# TODO — financiën lunchkraam / Revolut

## Principe: waarheid vs controle

*(Ontwerprichtlijn — geen open taken; gedrag zit in o.a. Revolut-import, bankkoppelingen en admin-rapportage.)*

- **Digitale geldstromen op de Revolut-rekening:** alleen vastleggen via **Revolut-import** (één bron van waarheid voor wat er echt op de rekening gebeurt).
- **Verkopen (kaarten, tellingen):** wél **bijhouden**, maar **niet** als financiële waarheid naast de bank — gebruiken als **controle op de werkelijkheid**: lopen we **voor** op de rekening, **achter**, of is het **synchroon** met wat Revolut toont?
- **Handmatig registreren** blijft zinvol voor wat **niet** (of niet betrouwbaar) via Revolut terugkomt: contant, correcties, uitzonderingen — zonder digitale inkomsten dubbel te boeken.

## Revolut vs tostikraam-verkoop

- [x] **Saldo / import:** Revolut-CSV-import (uitgaven + optioneel inkomsten als bank-omzet), saldo uit afschrift-kolom op **Boodschappen** (`AdminShopExpensesPage`), openstaande bankregels koppelen op **Financiën** (`AdminFinancePage`).
- [x] **Saldo vs verwachting in één beeld:** maandvergelijking in-app onder **Beheer → Verkoopcontrole** (zelfde delta-teken als `cmd/revolut-import reconcile`; legenda synchroon / Revolut hoger / App hoger). CLI blijft nuttig voor ruwe CSV. — **PR-K** (MVP geleverd; uitbreidingen mogelijk).
- [x] **Avondeten vs lunchkraam:** zelfde rekening, **apart doel** (`lunchkraam` / `avondeten`) bij import en handmatige boekingen; omzet- en uitgaven**split** in dashboard, grafieken, overzichten en import-voorbeeld.

## Losse posten (buiten digitale Revolut-lijn)

- [x] **Handmatige uitgaven / kas:** contante en digitale uitgave + **contant bij kas** op **Boodschappen**; dubbele import vs handmatige bon → **wachtrij** (pending reviews).
- [ ] **Overige correcties** expliciet modelleren (bijv. terugbetalingen, afspraken andere speltak/gasten) als jullie dat **niet** genoeg vinden onder bestaande boekingen + “bank zonder verkoop” op Financiën — productkeuze / korte workflow in UI — **PR-L**.
- [ ] Optioneel: **toelichting of tags** bij importregels (bijv. afwijkende Tikkie-groep) als **administratieve context**, zonder een tweede gelijke boeking te maken — **PR-M** (los of als fase 2 na **PR-L**).

## Nog uit te werken in product / UI

- [x] **Verkoopcontrole-scherm:** **Beheer → Verkoopcontrole** (`GET /api/admin|operator/finance-control`) met maandtabel + legenda; link vanaf Financiën. — **PR-K** (MVP).
- [x] **Documentatie vrijwilligers:** [docs/VOLUNTEERS.md](VOLUNTEERS.md) + link vanuit [README.md](../README.md). — **PR-O** (basis; optioneel uitbreiden met screenshots / extra UI-links).

## Code health — backend

*Last reviewed: 2026-04-19 (PR-N store/handler split)*

- [x] Gedeelde **EUR cent-rounding** helper (`internal/money.RoundEUR`; vervangt `math.Round(v*100)/100` bij JSON-uitvoer en rapportage).
- [x] Gedeelde **JSON body decode**: `httpx.ReadJSON` / `httpx.ReadJSONAllowEmpty` i.p.v. overal `json.NewDecoder(http.MaxBytesReader(…))` + uniforme 400 bij parse-fout.
- [x] **Store error → HTTP** centraal in [internal/httpx/store_errors.go](internal/httpx/store_errors.go) (`RespondStoreNotFound`, `WriteBankCreditStoreError`, tosti/kaart/avondeten/local-password helpers); handlers roepen die aan i.p.v. lange `errors.Is`-ketens.
- [x] **Logging**: `log/slog` met structured fields in handlers + [internal/httpx/json.go](internal/httpx/json.go); `slog.SetDefault` in [cmd/server/main.go](cmd/server/main.go); server-startupmeldingen (dist, listen, shutdown, bonfoto-map) ook via `slog`. (`log` alleen nog voor `log.Fatalf` bij fatale startup.) CLI [cmd/revolut-import/main.go](../cmd/revolut-import/main.go) gebruikt dezelfde `slog` naar stderr voor diagnostiek; **reconcile**-tabel blijft leesbare `fmt` naar stdout.
- [x] **HTTP smoke (`httptest`):** [internal/handlers/smoke_http_test.go](../internal/handlers/smoke_http_test.go) — `/health`, `/robots.txt`, anonieme `GET /api/me` (200 + `user: null`), `GET /api/cards` zonder sessie (401 JSON); **zonder database**. Uitbreiden blijft optioneel (DB-integratie, meer routes).

## Code health — frontend

*Last reviewed: 2026-04-19 (follow-up scan)*

- [x] Gedeelde **`formatEUR`** / **`roundCents`** in [frontend/src/utils/formatMoney.ts](frontend/src/utils/formatMoney.ts) (`Intl.NumberFormat` NL + EUR).
- [x] **Admin dashboard**-euro’s via `formatEUR` (geen losse `toFixed(2)`-strings); **Buy** en **Dashboard** gebruiken `formatEURFromString` voor dynamische bedragen. Het symbool **€** in vaste copy (labels, uitleg, o.a. admin Revolut-teksten) is cosmetisch en staat los van *Production backlog — code* tenzij jullie alles uniform willen trekken.
- [x] **Admin grafieken** (`AdminSalesCharts`): `roundCents` i.p.v. herhaalde `Math.round(x*100)/100`.
- [x] **Zod** — response- en payload-types in [frontend/src/api/types.ts](../frontend/src/api/types.ts) (barrel [frontend/src/api/index.ts](../frontend/src/api/index.ts)) via `z.infer<typeof …Schema>` gekoppeld aan [frontend/src/api.schemas.ts](frontend/src/api.schemas.ts) (sub-schema’s geëxporteerd waar nodig).
- [x] Optioneel: **`apiRequest`-factory** (`apiJson` / `apiVoid` / `apiFormJson` in [frontend/src/apiRequest.ts](frontend/src/apiRequest.ts)) — domeinmodules onder `frontend/src/api/` gebruiken dit centraal.
- [x] Optioneel: **TanStack Query** — `QueryClientProvider` in [frontend/src/main.tsx](frontend/src/main.tsx); admin-pagina’s met server state gebruiken `useQuery` / `invalidateQueries` (o.a. dashboard, requests, users, settings, sales charts, expenses overview, finance, shop expenses).

### Code review / vervolg (korte scan 2026-04-19)

- **Admin-fetchpatroon:** geen resterende `useEffect`+`void api.*`-loads op admin-pagina’s; mutaties invalidaten gerichte `queryKeys`.
- [x] **Jaarlijst + geselecteerd jaar (admin):** gedeelde hook [frontend/src/hooks/useAdminSalesYearsSelect.ts](frontend/src/hooks/useAdminSalesYearsSelect.ts) voor `salesYears` + state/sync + foutpad; gebruikt op Financiën, uitgaven-overzicht, boodschappen en **admin grafieken** (`AdminSalesCharts`, met `emptyYearsListBehavior` waar lege API-lijst het vorige jaar behoudt).
- [x] **Jaar-dropdown opties:** pure helper [frontend/src/utils/adminYearSelectOptions.ts](frontend/src/utils/adminYearSelectOptions.ts) + [unit test](frontend/src/utils/adminYearSelectOptions.test.ts); vervangt copy-paste `useMemo` op dezelfde admin-pagina’s.
- **Buiten admin:** [frontend/src/pages/KraamPage.tsx](../frontend/src/pages/KraamPage.tsx) op **TanStack Query** + WS-invalidatie; [frontend/src/pages/BuyPage.tsx](../frontend/src/pages/BuyPage.tsx) + [frontend/src/pages/OrderTostiPage.tsx](../frontend/src/pages/OrderTostiPage.tsx) op Query (`buyInfo`, `myCards` / `myTostiOrders` / `tostiQueue`) — zie **PR-H**.
- [x] **CLI** (`cmd/revolut-import`): diagnostiek via `slog` (stderr); reconcile-tabel via `fmt` (stdout) — zie **PR-D**.
- [x] **Admin query-fout → alert/toast:** gedeelde hook [frontend/src/hooks/useQueryErrorAlert.ts](frontend/src/hooks/useQueryErrorAlert.ts) i.p.v. copy-paste `useEffect` op admin-pagina’s (incl. Financiën met meerdere queries).

### Production backlog — code *(scan / plan 2026-04-19; uitvoering 2026-04-19)*

**Backend**

- [x] **Pending import merge:** transactionele merge via [internal/store/pending_import_reviews.go](internal/store/pending_import_reviews.go) (`MergePendingImportReview`); integratie-check [internal/store/pending_import_reviews_merge_test.go](internal/store/pending_import_reviews_merge_test.go) met `TEST_DATABASE_URL`.
- [x] **Generieke 500 + DB-fouten:** [internal/httpx/logged_errors.go](internal/httpx/logged_errors.go) (`RespondInternalStoreError`) op `"Databasefout."`-paden in handlers.
- [x] **Bank credit store:** types/errors + `scanBankCreditListRow` naar [internal/store/bank_credit_types.go](internal/store/bank_credit_types.go) (lijst-SQL blijft in `bank_credit_reconciliation.go`).
- [x] **Revolut shop import (HTTP-laag):** opgesplitst — dunne handlers in [internal/handlers/shop_expenses_revolut_import.go](../internal/handlers/shop_expenses_revolut_import.go); formulier/CSV/response-helpers in `revolut_shop_expenses_*.go` (zelfde package).
- [x] **Handler/store split (admin sales + shop expenses):** handlers — [api_admin_sales.go](../internal/handlers/api_admin_sales.go) (alleen `APIAdminSalesStats`), [admin_sales_rollups.go](../internal/handlers/admin_sales_rollups.go), [admin_sales_years.go](../internal/handlers/admin_sales_years.go); store — [shop_expenses_model.go](../internal/store/shop_expenses_model.go), [shop_expenses_write.go](../internal/store/shop_expenses_write.go), [shop_expenses_receipts.go](../internal/store/shop_expenses_receipts.go), [shop_expenses_queries.go](../internal/store/shop_expenses_queries.go). `parseSalesStatsYear` deelt jaar + timezone-label met finance-control. — **PR-N** (**gedaan**).

**Frontend**

- [x] **`useQueryErrorAlert`:** zie hook hierboven + admin-pagina’s.
- [x] **Card-kind labels/badges:** [frontend/src/utils/cardKindPresentation.ts](frontend/src/utils/cardKindPresentation.ts); Kraam re-exporteert vanuit [frontend/src/pages/kraam/kraamFormat.ts](frontend/src/pages/kraam/kraamFormat.ts).
- [x] **Lidgerichte + chart-tick euro’s:** `formatEURFromString` / `formatEUR` op Buy, Dashboard, admin-grafieken ([frontend/src/utils/formatMoney.ts](frontend/src/utils/formatMoney.ts)).
- [x] **TanStack Query (lid + operator):** `queryKeys.member` / `operator` + [CardsPage](../frontend/src/pages/CardsPage.tsx), [BuyPage](../frontend/src/pages/BuyPage.tsx) (`buyInfo` + `myCards`), [OrderTostiPage](../frontend/src/pages/OrderTostiPage.tsx), [KraamPage](../frontend/src/pages/KraamPage.tsx) — zie **PR-G** / **PR-H**.
- [x] **Kraam (operator):** Query + WebSocket `invalidateQueries` — [frontend/src/pages/KraamPage.tsx](../frontend/src/pages/KraamPage.tsx), `queryKeys.operator.*` in [frontend/src/queryKeys.ts](../frontend/src/queryKeys.ts).  
- [x] **OrderTosti + Buy (lid):** `useQuery` + `invalidateQueries` — [frontend/src/pages/OrderTostiPage.tsx](../frontend/src/pages/OrderTostiPage.tsx), [frontend/src/pages/BuyPage.tsx](../frontend/src/pages/BuyPage.tsx); `queryKeys.member.myTostiOrders` + `tostiQueue` in [frontend/src/queryKeys.ts](../frontend/src/queryKeys.ts) (**PR-H**).
- [x] **Zod randgevallen:** WebSocket-envelope in [frontend/src/useTostiRealtime.ts](../frontend/src/useTostiRealtime.ts); veilige error-body in [frontend/src/apiRequest.ts](../frontend/src/apiRequest.ts) (`parseError`) + [frontend/src/apiRequest.test.ts](../frontend/src/apiRequest.test.ts) — **PR-I**.

---

## Uitgewerkte PR’s — professionalisering (detailplan)

Onderstaande PR’s zijn bewust **klein houdbaar per scope** zodat review en rollback eenvoudig blijven. Volgorde onderaan is een **voorstel**; pas aan op team-capaciteit.

### PR-A — CI: `npm test` + `go test ./...` op de verify-job

| Veld | Inhoud |
|------|--------|
| **Doel** | Regressies vangen vóór Docker-build en deploy; sluit aan op “draft tot verify” uit coding standards. |
| **Context** | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml): verify-job draait o.a. `docker build` na compile. |
| **Wijzigingen** | 1) In de `node:25-alpine`-stap: `npm ci && npm run lint && npm test` (Vitest). 2) Na checkout + `setup-go`: `go vet ./...`, daarna `go test ./... -count=1`, daarna `go build`. 3) Postgres-integratie: zonder `TEST_DATABASE_URL` blijft [internal/store/pending_import_reviews_merge_test.go](../internal/store/pending_import_reviews_merge_test.go) via `t.Skip` uitgesloten op GitHub-hosted — optioneel later service-container + secret toevoegen om die test ook in CI te draaien. |
| **Acceptatie** | Groene verify-workflow op `production` push / `workflow_dispatch`. |
| **Risico** | Flaky tests → fixen; ontbrekende DB voor merge-test blijft bewust skipped tot jullie CI secrets uitbreiden. |
| **Grootte** | Klein (YAML + eventueel kleine testfixes). |
| **Status** | **Gedaan** — PR-A staat in de workflow (`npm test` in Alpine; `go test ./... -count=1` op de runner). |

### PR-B — Backend: `shop_expenses_revolut_import` handler opsplitsen

| Veld | Inhoud |
|------|--------|
| **Doel** | Dunne HTTP-laag, reviewbare units; minder merge-conflicten op één megabestand. |
| **Context** | Was één bestand ~375+ regels; zie *Production backlog — code*. |
| **Wijzigingen (uitgevoerd)** | 1) [internal/handlers/revolut_shop_expenses_form.go](../internal/handlers/revolut_shop_expenses_form.go) — `maxRevolutCSVFormBytes`, formulier-parsers, `parseRevolutDefaultPurpose`, `revolutCommonUIForm` / `parseRevolutCommonUIForm`, `validateRevolutCreditImportAmounts`. 2) [internal/handlers/revolut_shop_expenses_read.go](../internal/handlers/revolut_shop_expenses_read.go) — `readRevolutShopExpenseCSV` (multipart + `revolutcsv.Parse`, uniforme JSON-fouten). 3) [internal/handlers/revolut_shop_expenses_response.go](../internal/handlers/revolut_shop_expenses_response.go) — `writeShopRevolutPreviewJSON` / `writeShopRevolutImportJSON` (zelfde response-keys als voorheen). 4) [internal/handlers/shop_expenses_revolut_import.go](../internal/handlers/shop_expenses_revolut_import.go) — alleen `APIShopExpensesRevolutPreview` en `APIShopExpensesRevolutImport` (orchestratie). **Geen** wijziging in `revolutimport`-domeinlogica. |
| **Acceptatie** | `go test ./...` groen; handmatig op staging: Revolut preview + import (dry-run en echt). |
| **Risico** | Medium (geldpad) — diff is vooral verplaatsing; bij twijfel side-by-side JSON-response vergelijken. |
| **Grootte** | Medium. |
| **Status** | **Gedaan** (structuursplit; optionele extra tests kunnen in aparte PR). |

### PR-C — Backend: optioneel `httptest`-smoke op publieke / auth-routes

| Veld | Inhoud |
|------|--------|
| **Doel** | Vastleggen van HTTP-contracten (status + JSON-vorm) voor een paar kritieke routes zonder volledige E2E. |
| **Scope (ingevoerd)** | `GET /health` → 200 + `ok` + `text/plain`; `GET /robots.txt` → 200; anonieme `GET /api/me` → **200** met `user: null` (zoals productie — geen 401); `GET /api/cards` zonder sessie → **401** JSON `unauthorized`. Geen `TEST_DATABASE_URL` nodig. |
| **Wijzigingen (uitgevoerd)** | 1) [internal/handlers/public_meta.go](../internal/handlers/public_meta.go) — `Health`, `RobotsTxt` (door [cmd/server/main.go](../cmd/server/main.go) geregistreerd). 2) [internal/handlers/smoke_http_test.go](../internal/handlers/smoke_http_test.go) — Chi + `httptest`, session store, `csrf.Protect(nil)`, `OptionalUser`/`RequireUserAPI` waar nodig. |
| **Acceptatie** | `go test ./...` groen op CI zonder Postgres. |
| **Risico** | Laag — geen DB; `RequireUserAPI(nil)` is alleen veilig zolang tests geen ingelogde sessie simuleren. |
| **Grootte** | Klein. |
| **Status** | **Gedaan** (basis-smoke; uitbreiden kan in follow-up). |

### PR-D — Backend (cosmetisch): `cmd/revolut-import` naar `slog`

| Veld | Inhoud |
|------|--------|
| **Doel** | Eén log-storyline met de server (`slog` naar stderr, key/value fields). |
| **Context** | [cmd/revolut-import/main.go](../cmd/revolut-import/main.go): voorheen `log` + `fmt` voor reconcile-tabel. |
| **Wijzigingen (uitgevoerd)** | `slog.SetDefault` (text handler, stderr) aan begin van `main`; alle `log.Print*` vervangen door `slog.Info` / `Warn` / `Error` met velden; dry-run regels als gestructureerde `slog.Info`. **Reconcile**-kop en maandtabel ongewijzigd op **stdout** via `fmt.Printf` / `fmt.Println` (pipe-vriendelijk). `usage()` blijft `fmt.Fprintf` naar stderr. |
| **Acceptatie** | `go build ./cmd/revolut-import`; dry-run import toont nog steeds “would upsert”-regels (nu key=value-tekst i.p.v. één vrije string — scripts die exact de oude regel parsen kunnen breken). |
| **Risico** | Laag voor DB-paden; **let op** voor log-parsers op stderr. |
| **Grootte** | Klein. |
| **Status** | **Gedaan**. |

### PR-E — Frontend: `AdminShopExpensesPage` opsplitsen in subcomponenten

| Veld | Inhoud |
|------|--------|
| **Doel** | Bestand ~1300+ regels inkorten; makkelijker review en onboarding. |
| **Voorgestelde bestanden** | Zie **uitgevoerd** hieronder. Pagina blijft orchestrator: hooks, `queryClient`, callbacks doorgeven via props. |
| **Wijzigingen (uitgevoerd)** | 1) [frontend/src/pages/admin/adminShopExpensesTypes.ts](../frontend/src/pages/admin/adminShopExpensesTypes.ts) — `ShopExpensesListBundle`, `ShopBookingKind`. 2) [frontend/src/pages/admin/adminShopExpensesHelpers.tsx](../frontend/src/pages/admin/adminShopExpensesHelpers.tsx) — `todayISO`, bon/Revolut-labels, `formatDateTimeShortNL`, `revolutImportResultDetail` (ongewijzigde markup). 3) [frontend/src/pages/admin/AdminShopExpensesRevolutPanel.tsx](../frontend/src/pages/admin/AdminShopExpensesRevolutPanel.tsx) — Revolut-saldo + CSV-formulier + transactievoorbeeld-tabel. 4) [frontend/src/pages/admin/AdminShopExpensesPendingReviews.tsx](../frontend/src/pages/admin/AdminShopExpensesPendingReviews.tsx) — duplicate-reviewkaarten. 5) [frontend/src/pages/admin/AdminShopExpensesTable.tsx](../frontend/src/pages/admin/AdminShopExpensesTable.tsx) — jaarkeuze + boekingentabel (bon/acties). 6) [frontend/src/pages/admin/AdminShopExpensesPage.tsx](../frontend/src/pages/admin/AdminShopExpensesPage.tsx) — intro + nieuwe-boeking-formulier + compositie; **geen** gedrag/API-wijziging. |
| **Acceptatie** | `npm run build` groen; handmatig: jaar wisselen, bon upload, Revolut preview/import, pending reviews merge/dismiss. |
| **Risico** | Laag bij pure extractie; prop-surface expliciet gehouden. |
| **Grootte** | Groot diff, laag risico. |
| **Status** | **Gedaan**. |

### PR-F — Frontend: `api.ts` modulair maken (re-exports)

| Veld | Inhoud |
|------|--------|
| **Doel** | Monoliet `api.ts` (~640+ regels) splitsen in domeinmodules zonder alle import-paden in de app te breken. |
| **Wijzigingen (uitgevoerd)** | Map [frontend/src/api/](../frontend/src/api/): `types.ts` (alle `z.infer`-types + `CreateTostiOrderBody`), `auth.ts`, `adminUsers.ts`, `operator.ts`, `tostiOrders.ts`, `memberBuy.ts`, `sales.ts`, `shopExpenses.ts`, `adminRequests.ts`, `adminSettings.ts`, `bankCredits.ts`, [index.ts](../frontend/src/api/index.ts) (re-export + `ApiError`). Monoliet `api.ts` verwijderd; `from '../api'` blijft via directory-barrel. |
| **Acceptatie** | `npm run build` groen; geen gedragwijziging; geen circulaire imports tussen domeinmodules. |
| **Risico** | Medium (import cycles) — mitigatie: types alleen in `types.ts`, domeinbestanden importeren `../apiRequest` + `../api.schemas` + `./types`. |
| **Grootte** | Medium (mechanisch). |
| **Status** | **Gedaan**. |

### PR-G — Frontend: `KraamPage` + realtime op TanStack Query

| Veld | Inhoud |
|------|--------|
| **Doel** | Zelfde server-state-patroon als admin: caching, dedupe, `invalidateQueries` na mutaties. |
| **Context** | *Production backlog*: Kraam had handmatige loads + `useState`; WebSocket via [frontend/src/useTostiRealtime.ts](../frontend/src/useTostiRealtime.ts). |
| **Wijzigingen (uitgevoerd)** | 1) [frontend/src/queryKeys.ts](../frontend/src/queryKeys.ts) — `queryKeys.operator` (`cards(q)`, `members`, `tostiOrders`, `soldToday`, `avondetenRegistrations(mealDate)`). Betalingen delen `queryKeys.admin.requests` met admin-aanvragen. 2) [frontend/src/pages/KraamPage.tsx](../frontend/src/pages/KraamPage.tsx) — `useQuery` per domein met `enabled` op operator/admin-rol; debounce 300ms op kaart-zoekterm; `useQueryErrorAlert` voor laadfouten (behalve verkocht-vandaag: stil `null` zoals voorheen). 3) Mutaties: `queryClient.invalidateQueries` op gerichte keys i.p.v. handmatige `load*`. 4) WS `onHint`: `open` → prefix `['operator']` + `admin.requests`; `tosti_queue` → orders, sold-today, `cards`-prefix, huidige avondeten-key; `payment_requests` → `admin.requests` alleen. Geen `useMutation`-wrapper (bewuste minimale diff). |
| **Acceptatie** | `npm run build`; handmatig kraam-flow (zoeken, knipje, tosti, betalingen, avondeten, fysieke verkoop). |
| **Risico** | Realtime + cache — mitigatie: smalle invalidation; `admin.requests` deelt cache met `AdminRequestsPage`. |
| **Grootte** | Groot; **PR-H** volgt voor OrderTosti/Buy. |
| **Status** | **Gedaan** (Kraam alleen). |

### PR-H — Frontend: `OrderTostiPage` (en rest Buy) naar Query

| Veld | Inhoud |
|------|--------|
| **Doel** | Consistentie met `CardsPage` / admin; minder `useEffect`+manual refresh. |
| **Wijzigingen (uitgevoerd)** | 1) [frontend/src/queryKeys.ts](../frontend/src/queryKeys.ts) — `member.myTostiOrders`, `member.tostiQueue` (naast bestaande `myCards`, `buyInfo`). 2) [frontend/src/pages/OrderTostiPage.tsx](../frontend/src/pages/OrderTostiPage.tsx) — `useQuery` voor kaarten (`myCards`), `getMyTostiOrders`, wachtrij (stille fout in `queryFn` zoals voorheen); eerste render wacht op `isFetched` voor alle drie; WebSocket + mutaties → `invalidateQueries` op `myCards`, `myTostiOrders`, `tostiQueue` + `refresh()`. 3) [frontend/src/pages/BuyPage.tsx](../frontend/src/pages/BuyPage.tsx) — `getBuyInfo` via `useQuery` + `useQueryErrorAlert`; mutaties invalidaten `buyInfo` naast `myCards`. |
| **Acceptatie** | `npm run build`; handmatig Buy + tosti bestellen/annuleren. |
| **Risico** | Medium — gedeelde `myCards`-cache met `CardsPage` / OrderTosti blijft bewust één bron. |
| **Grootte** | Medium. |
| **Status** | **Gedaan**. |

### PR-I — Frontend: Zod + robuustheid randgevallen

| Veld | Inhoud |
|------|--------|
| **Doel** | Minder runtime-verrassingen op WS- en error-envelopes. |
| **Wijzigingen (uitgevoerd)** | 1) [frontend/src/useTostiRealtime.ts](../frontend/src/useTostiRealtime.ts) — `tostiRealtimeMessageSchema` (`t` optioneel string); `JSON.parse` + `safeParse`; bij fout **alleen in dev** `console.warn`, anders stille drop (geen `onHint`). 2) [frontend/src/apiRequest.ts](../frontend/src/apiRequest.ts) — `parseError` leest `res.text()`, probeert `JSON.parse` + `{ error, message }` met typechecks; anders korte body-tekst of `statusText`. 3) [frontend/src/apiRequest.test.ts](../frontend/src/apiRequest.test.ts) — Vitest voor JSON / HTML / lege body. |
| **Acceptatie** | `npm test` + `npm run build`; happy-path WS ongewijzigd. |
| **Risico** | Medium (foutpaden). |
| **Grootte** | Klein–medium. |
| **Status** | **Gedaan**. |

### PR-J — Paraplu (verwijzing)

| Veld | Inhoud |
|------|--------|
| **Rol** | Verwijsindex: concrete vervolgwerk zit in **PR-K t/m PR-O** (hieronder). Oude bullets *Revolut vs tostikraam*, *Losse posten*, *Nog uit te werken* en *Production backlog — backend* linken naar die PR’s. |
| **Opmerking** | Geen merge van “alles in één PR”; houd domeinscheiding voor review en rollback. |

### PR-K — Product + API: financieel controle-overzicht (*voor / achter / synchroon*)

| Veld | Inhoud |
|------|--------|
| **Doel** | Eén **admin**-scherm (of duidelijk benoemde sectie) waar vrijwilligers **in één oogopslag** zien of digitale omzet **voor** op de Revolut-lijn ligt, **achter**, of **synchroon** — consistent met het principe *waarheid vs controle* (Revolut blijft bron voor bank; app-omzet is controle). |
| **Context** | CLI `cmd/revolut-import` reconcile geeft al maandvergelijking; Dashboard / Overzichten / Financiën dekken delen, maar zonder gedeelde legenda en zonder expliciete statuslabels. |
| **Product / UX** | 1) **Definities** (copy + tooltips): wat is “verwachte omzet” (periode, doelen lunchkraam/avondeten, accordering), wat is “bankzijde” (Revolut-import credits, saldo-snapshot, cumulatief). 2) **Legenda** drie statussen met kleuren/iconen; optioneel vierde “onbekend/onvoldoende data”. 3) **Periode-switch**: jaar + optioneel maand / cumulatief YTD (afstemmen met bestaande admin-jaarpatronen). 4) **Navigatie**: link vanaf Financiën, Overzichten of admin-dashboard; broodkruim of titel “Verkoopcontrole”. |
| **Backend** | 1) Nieuw(e) endpoint(s), bv. `GET /api/admin/finance-control?year=&month=` (operator-variant indien nodig), die **bestaande tabellen** gebruiken (`bank_credits`, kaartverkopen, importmetadata — exacte joins in ontwerpfase vastleggen). 2) **Zelfde rekensommen** als CLI waar mogelijk: overweeg gedeelde pure-Go package of interne helper gedeeld met `cmd/revolut-import` om drift te voorkomen (of documenteer bewuste afwijkingen). 3) **Rounding**: `internal/money.RoundEUR` overal in JSON. 4) **Auth**: zelfde als Financiën/overzichten. |
| **Frontend** | Nieuwe pagina bv. `AdminFinanceControlPage` of uitbreiding `AdminFinancePage`; **TanStack Query** + `queryKeys.admin.financeControl(…)`; `useQueryErrorAlert`; lege toestanden (“nog geen import dit jaar”). |
| **Testen** | 1) Handler-/store-tests met `TEST_DATABASE_URL` waar zinvol. 2) **Gouden fixture** of vergelijking met één bekende CLI-reconcile-run (document in PR-beschrijving). |
| **Acceptatie** | `go test ./...`, `npm run build`; inhoudelijk akkoord van penningmeester op definities + labels; geen regressie op bestaande Financiën-routes. |
| **Risico** | **Hoog** (interpretatie product + dubbele waarheid); mitigatie: ontwerp eerst in issue/figma, één bron per cijfer in code documenteren. |
| **Grootte** | **Groot** (backend + frontend + copy). |
| **Status** | **MVP gedaan** (april 2026): API + admin/operator UI + README/VOLUNTEERS; productreview en eventuele copy-/CSV-pariteit kunnen nog volgen. |

### PR-L — Product + data: overige correcties (boekingen buiten standaardpad)

| Veld | Inhoud |
|------|--------|
| **Doel** | Modelleren van **correcties** (terugbetalingen, andere speltak, gasten, interne verrekeningen) die **niet** goed in huidige “uitgave / bank zonder verkoop / handmatige bon” passen — zonder dubbele digitale omzet. |
| **Context** | Zie *Losse posten*; besluitvorming: voldoet “handmatige boeking + Financiën” of is een **expliciet type** nodig (audit, rapportage, filters). |
| **Ontwerp (voor code)** | 1) Enum of `correction_kind` + optionele koppeling naar `shop_expense` / `bank_credit` / vrije tekst. 2) Impact op **Overzichten**, **Dashboard**, export (wel/niet meetellen in “verwacht”). 3) Rechten: alleen admin of ook operator. |
| **Backend** | Migratie(s); store-functies; handlers; `httpx` + typed errors volgens repo-standaard; idempotency waar van toepassing. |
| **Frontend** | Workflow op **Financiën** of **Boodschappen** (kort formulier + bevestiging); uitleg in UI waarom dit pad bestaat. |
| **Acceptatie** | Migraties reversibel of backup-plan; `go test`; handmatige scenario’s in staging; geen dubbele telling in PR-K rapportage zodra die bestaat (cross-check in PR-beschrijving). |
| **Risico** | Medium–hoog (boekhoudkundige kant); mitigatie: kleine MVP (één correctietype) vóór uitbreiding. |
| **Grootte** | Medium–groot. |
| **Status** | **Gepland**. |

### PR-M — Optioneel: administratieve tags / toelichting bij importregels

| Veld | Inhoud |
|------|--------|
| **Doel** | **Context** bij importregels (bv. afwijkende Tikkie-groep, kamp) **zonder** tweede gelijke boeking — alleen leesbare/administratieve metadata. |
| **Scope** | Alleen indien **PR-L** of productprioriteit dit nodig heeft; kan **na PR-L** als fase 2 om scope te beperken. |
| **Backend** | Nullable kolom(men) of kleine `import_line_note`-tabel gekoppeld aan bestaande unieke sleutels (`external_id` / fingerprint); PATCH of inline in import-response; geen wijziging aan bedrag/kernboeking zonder expliciete user-actie. |
| **Frontend** | Kolom of slide-over in Revolut-preview / Financiën; bewerkbaar door admin; max. lengte server-side. |
| **Acceptatie** | Geen wijziging default-importgedrag zonder tag; XSS-veilige weergave (escape); `go test` / `npm run build`. |
| **Risico** | Laag bij read-only MVP; medium bij edit + historie. |
| **Grootte** | Klein–medium. |
| **Status** | **Optioneel / gepland**. |

### PR-N — Backend: splitsen `api_admin_sales` + `shop_expenses` store

| Veld | Inhoud |
|------|--------|
| **Doel** | Minder merge-conflicten, duidelijkere lagen: DTO/rounding, handler-orchestratie, store per concern — zelfde HTTP-contracten als nu. |
| **Context** | *Production backlog — code*: admin sales + shop expenses store (zie checklist hierboven). |
| **Wijzigingen (uitgevoerd)** | 1) **Sales:** `admin_sales_rollups.go` (rollup + tosti-rijhelpers), `admin_sales_years.go` (`parseSalesStatsYear`, `mergeFinanceYears`, `APIAdminSalesYears`, `monthLabelNL`), dun `api_admin_sales.go` met alleen `APIAdminSalesStats`. 2) **Shop expenses:** `shop_expenses_model.go`, `shop_expenses_write.go`, `shop_expenses_receipts.go`, `shop_expenses_queries.go` (zelfde methodes/HTTP-contracten). 3) `APIAdminFinanceControl` gebruikt `parseSalesStatsYear` i.p.v. gedupliceerde jaarparse. |
| **Acceptatie** | `go test ./... -count=1`; handmatig: admin sales endpoints + shop expense flows ongewijzigd (statuscodes, JSON-keys). |
| **Risico** | Medium (grote touch); mitigatie: mechanische verplaatsing + smoke `httptest` uitbreiden waar rendabel. |
| **Grootte** | Medium–groot. |
| **Status** | **Gedaan** (april 2026). |

### PR-O — Documentatie: vrijwilligershandleiding (repo + links)

| Veld | Inhoud |
|------|--------|
| **Doel** | Eén **leesbare handleiding** (Nederlands) voor niet-ontwikkelaars: stappenplan import vs handmatig, waar saldo staat, hoe bankregels koppelen, wie te mailen bij problemen. |
| **Deliverables** | 1) Nieuw doc bv. [docs/VOLUNTEERS.md](VOLUNTEERS.md) of `docs/handleiding-vrijwilligers.md` met inhoudsopgave. 2) Korte verwijzing in [README.md](../README.md) en/of [docs/ARCHITECTURE.md](ARCHITECTURE.md). 3) Optioneel: één zin + link in admin UI (footer of “?”-pagina) — alleen als product akkoord is. |
| **Acceptatie** | Spelling/concept review door team; geen build-afhankelijkheid verplicht (alleen markdown tenzij UI-link). |
| **Risico** | Laag. |
| **Grootte** | Klein (documentatie-only MVP); medium als UI-links + screenshots. |
| **Status** | **Basis gedaan** (april 2026): vrijwilligershandleiding in repo; optionele UI-“?”-link of screenshots blijven open. |

---

### Aanbevolen merge-volgorde

1. **PR-A** (CI-tests) — **afgerond**; beschermt alle volgende wijzigingen op `production` pushes.  
2. **PR-B** (Revolut handler-split) — **afgerond**.  
3. **PR-C** (`httptest` smoke) — **afgerond**.  
4. **PR-D** (CLI `slog`) — **afgerond**.  
5. **PR-E** (`AdminShopExpensesPage`-split) — **afgerond**.  
6. **PR-F** (api-modularisatie) — **afgerond**.  
7. **PR-G** (Kraam + Query + WS-invalidatie) — **afgerond**.  
8. **PR-H** (OrderTosti + Buy op Query) — **afgerond**.  
9. **PR-I** (Zod WS + veilige `parseError`) — **afgerond**.  
10. **PR-J** — paraplu; zie **PR-K–O**.  
11. **PR-O** (vrijwilligersdoc) — **eerst** doen als laag risico; helpt uitlijnen copy voor **PR-K**.  
12. **PR-N** (backend split sales / shop_expenses) — **afgerond**.  
13. **PR-K** (financieel controle-overzicht) — MVP afgerond; verfijning optioneel.  
14. **PR-L** (overige correcties) — productbesluit; kan **na PR-K** als rapportage daarop correctietypes moet tonen.  
15. **PR-M** (tags import) — optioneel, **na PR-L** of zelfstandig volgens prioriteit.

---

### Koppeling aan bestaande checklistregels in dit document

| Backlog-regel | PR |
|---------------|-----|
| *Production backlog — Backend* “shop_expenses_revolut_import splitsen” | **PR-B** (**gedaan**) |
| *Production backlog — Backend* “api_admin_sales / shop_expenses splitsen” | **PR-N** (**gedaan**) |
| *Production backlog — Frontend* “Kraam + OrderTosti Query” | **PR-G** (**gedaan**), **PR-H** (**gedaan**) |
| *Revolut vs tostikraam* “saldo vs verwachting” + *Nog uit te werken* verkoopcontrole | **PR-K** (**MVP gedaan**; verfijning mogelijk) |
| *Losse posten* “overige correcties” | **PR-L** (**gepland**) |
| *Losse posten* “tags / toelichting import” | **PR-M** (**optioneel**) |
| *Nog uit te werken* vrijwilligersdocumentatie | **PR-O** (**basis gedaan**; optioneel uitbreiden) |
| *Code health — backend* HTTP smoke / uitbreidbare `httptest` | **PR-C** (**gedaan**) |
| *Code review* CLI `slog` (`revolut-import`) | **PR-D** (**gedaan**) |
| Geen expliciete regel maar scan-bevinding | **PR-A** (**gedaan**), **PR-E** (**gedaan**), **PR-F** (**gedaan**), **PR-I** (**gedaan**) |

## Libraries vs zelf bouwen (richtlijn)

- **Liever een dependency** wanneer die een hele bug-klasse of herhaald boilerplate oplost (bijv. **TanStack Query** voor server state; een CSV-library alleen als `internal/revolutcsv` tekort schiet).
- **Liever stdlib of kleine interne helper** voor beknopte dingen: centafronding, één `DecodeJSON`, duidelijke foutmapping — zolang `float64` en JSON acceptabel blijven voor jullie use case.
- **Afronding / boekhoudkundige exactheid:** pas **decimal**-achtige packages overwegen (bijv. `shopspring/decimal`) als float-problemen echt spelen, niet “voor netjes”.
- **Vermijden:** zware UI-kits of ORM’s tussentijds invoeren zolang **Chi + pgx + handgeschreven SQL** en de huidige stack al bij de codebase passen.
