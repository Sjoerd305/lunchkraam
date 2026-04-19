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
| **Context** | [internal/handlers/shop_expenses_revolut_import.go](../internal/handlers/shop_expenses_revolut_import.go) is groot (~375+ regels); staat ook in *Production backlog* onder “nog te splitsen”. |
| **Wijzigingen** | 1) Pure logica (CSV-validatie, dry-run samenvatting, response-DTO’s) naar `internal/handlers/revolut_shop_expenses_helpers.go` of `internal/revolutimport/` façade — **geen** gedragwijziging in de eerste commit. 2) Handlers blijven: `ReadJSON` → aanroep helper → `httpx` store-errors / JSON response. 3) Bestaande import-tests uitbreiden of smoke-test op preview-response als er nog geen dekkingsgraad is. |
| **Acceptatie** | `go test ./...` groen; handmatig: Revolut preview + import (dry-run en echt) op staging. |
| **Risico** | Medium (geldpad) — daarom **geen** functionele refactor in dezelfde PR als verplaatsing; tweede PR mag performance/UX tunen. |
| **Grootte** | Medium. |

### PR-C — Backend: optioneel `httptest`-smoke op publieke / auth-routes

| Veld | Inhoud |
|------|--------|
| **Doel** | Vastleggen van HTTP-contracten (status + JSON-vorm) voor een paar kritieke routes zonder volledige E2E. |
| **Scope (voorbeeld)** | `GET /health` → 200 + body `ok`; `GET /api/me` zonder sessie → 401/403 zoals nu; eventueel één route met test-doubles voor store (als jullie al een pattern hebben). |
| **Wijzigingen** | Nieuwe `internal/handlers/smoke_test.go` of per-domein `*_http_test.go`; gebruik `httptest.NewRecorder` + minimale router-setup (of factor `setupTestRouter(t)` helper indien nodig). |
| **Acceptatie** | Tests draaien zonder DB waar mogelijk; anders duidelijk in README/PR welke env nodig is. |
| **Risico** | Laag als alleen stateless routes; hoger als DB-testcontainers — hou PR klein. |
| **Grootte** | Klein tot medium. |

### PR-D — Backend (cosmetisch): `cmd/revolut-import` naar `slog`

| Veld | Inhoud |
|------|--------|
| **Doel** | Eén log-storyline met de server (`slog` naar stderr, key/value fields). |
| **Context** | [cmd/revolut-import/main.go](../cmd/revolut-import/main.go): nu `log` + `fmt.Printf` voor reconcile-tabel — functioneel prima, inconsistent met `cmd/server`. |
| **Wijzigingen** | Vervang `log.Printf` door `slog.Info` / `Warn` / `Error`; tabellarische reconcile-output kan `fmt` blijven (stdout voor menselijke consumptie) óf achter `-human` flag — expliciet kiezen in PR. |
| **Acceptatie** | CLI-output voor scripts blijft bruikbaar (document breaking change als stdout-formaat wijzigt). |
| **Risico** | Laag. |
| **Grootte** | Klein. |

### PR-E — Frontend: `AdminShopExpensesPage` opsplitsen in subcomponenten

| Veld | Inhoud |
|------|--------|
| **Doel** | Bestand ~1300+ regels inkorten; makkelijker review en onboarding. |
| **Voorgestelde bestanden** | `AdminShopExpensesRevolutPanel.tsx` (upload, preview, import, credit-instellingen); `AdminShopExpensesPendingReviews.tsx`; `AdminShopExpensesTable.tsx` (tabel + bonnen/acties); optioneel `adminShopExpensesTypes.ts` voor lokale types. Pagina blijft orchestrator: hooks, `queryClient`, callbacks doorgeven via props. |
| **Wijzigingen** | Alleen verplaatsen + props doorgeven; **geen** businesslogica wijzigen in de eerste PR. Storybook hoeft niet. |
| **Acceptatie** | `npm run build` + handmatig: jaar wisselen, bon upload, Revolut preview/import, pending reviews merge/dismiss. |
| **Risico** | Laag bij pure extractie; let op prop-drilling — max één niveau “container” + “presentational”. |
| **Grootte** | Groot diff, laag risico. |

### PR-F — Frontend: `api.ts` modulair maken (re-exports)

| Veld | Inhoud |
|------|--------|
| **Doel** | `frontend/src/api.ts` (~640+ regels) splitsen in domeinmodules zonder alle import-paden in de app te breken. |
| **Wijzigingen** | Bijv. `api/client.ts` (csrf, base URL), `api/adminFinance.ts`, `api/shopExpenses.ts`, … + `api/index.ts` die alles re-exporteert. Call sites kunnen gefaseerd `from '../api/adminFinance'` krijgen **of** ongewijzigd `from '../api'` houden via barrel file. |
| **Acceptatie** | Geen gedragwijziging; bundelgrootte vergelijkbaar of beter; circulaire imports vermijden. |
| **Risico** | Medium (import cycles) — tooling: `tsc -b` en grep op dubbele exports. |
| **Grootte** | Medium (mechanisch). |

### PR-G — Frontend: `KraamPage` + realtime op TanStack Query

| Veld | Inhoud |
|------|--------|
| **Doel** | Zelfde server-state-patroon als admin: caching, dedupe, `invalidateQueries` na mutaties. |
| **Context** | *Production backlog*: Kraam nog handmatige loads + veel `useState`; WebSocket in [frontend/src/useTostiRealtime.ts](../frontend/src/useTostiRealtime.ts) (of gelijknamige hook). |
| **Wijzigingen** | 1) Nieuwe `queryKeys` voor operator endpoints (kaarten, leden, tosti-wachtrij, betaalverzoeken, avondeten, verkocht-vandaag). 2) `useQuery` per domein met `enabled: Boolean(user)` / operatorrol. 3) `useMutation` + `onSuccess` → `invalidateQueries` voor getroffen keys. 4) In WS-handler: gerichte `invalidateQueries` (geen blanket `invalidateQueries()`), documenteren in PR. 5) Optioneel later: Zod op WS-payload (staat al in backlog). |
| **Acceptatie** | Handmatig kraam-flow: zoeken, verkopen, tosti leveren/annuleren, betalingen, avondeten; geen dubbele spinners; netwerk-tab toont geen storm van identieke requests. |
| **Risico** | **Hoog** voor realtime-koppeling — feature-flag of achter env is optioneel. |
| **Grootte** | Groot; overweeg **PR-G1** alleen reads + **PR-G2** mutaties + WS. |

### PR-H — Frontend: `OrderTostiPage` (en rest Buy) naar Query

| Veld | Inhoud |
|------|--------|
| **Doel** | Consistentie met `BuyPage` / `CardsPage`; minder `useEffect`+manual refresh. |
| **Wijzigingen** | `OrderTostiPage`: queues/recents via `useQuery` + keys in `queryKeys`; mutaties invalidaten sibling-queries. BuyPage: `getBuyInfo` als `useQuery` i.p.v. alleen `loadBuyInfo` callback (BuyPage gebruikt al `queryClient` voor invalidatie — afronden). |
| **Acceptatie** | Vitest waar zinvol; handmatig tosti bestellen/annuleren. |
| **Risico** | Medium. |
| **Grootte** | Medium (per pagina eigen PR mogelijk). |

### PR-I — Frontend: Zod + robuustheid randgevallen

| Veld | Inhoud |
|------|--------|
| **Doel** | Minder runtime-verrassingen op WS- en error-envelopes. |
| **Wijzigingen** | 1) `useTostiRealtime`: inkomende berichten parsen met kleine Zod-schema’s; bij parse-fout: `slog`-achtige `console.warn` in dev alleen of stille drop + metric later. 2) `apiRequest.parseError`: response body als JSON veilig proberen; fallback string blijft. |
| **Acceptatie** | Geen regressie in happy path; bij corrupt WS-bericht crasht de app niet. |
| **Risico** | Medium (foutpaden). |
| **Grootte** | Klein–medium. |

### PR-J — Product (referentie; meestal geen pure code-PR)

| Items | Verkoopcontrole-scherm, vrijwilligersdocumentatie, “overige correcties”-model — zie secties *Nog uit te werken* en *Losse posten* bovenin dit document. |
| **Opmerking** | Per item aparte PR met ontwerp + copy; niet mengen met refactor-PR’s. |

---

### Aanbevolen merge-volgorde

1. **PR-A** (CI-tests) — **afgerond**; beschermt alle volgende wijzigingen op `production` pushes.  
2. **PR-B** of **PR-E** (grote structurele wijziging terwijl tests groen zijn).  
3. **PR-D** (CLI cosmetica) — losstaand, elk moment.  
4. **PR-F** (api-modularisatie) — vóór of na **PR-G/H** afhankelijk van conflict-pijn.  
5. **PR-G** / **PR-H** (Query-migraties) — in deel-PR’s als review-capaciteit beperkt is.  
6. **PR-C** / **PR-I** — wanneer infra/testbaarheid er is.

---

### Koppeling aan bestaande checklistregels in dit document

| Backlog-regel | PR |
|---------------|-----|
| *Production backlog — Backend* “shop_expenses_revolut_import splitsen” | **PR-B** |
| *Production backlog — Frontend* “Kraam + OrderTosti Query” | **PR-G**, **PR-H** |
| *Code health — backend* “HTTP-handler tests optioneel” | **PR-C** |
| *Code review* “CLI log.Printf” | **PR-D** |
| Geen expliciete regel maar scan-bevinding | **PR-A**, **PR-E**, **PR-F**, **PR-I** |

## Libraries vs zelf bouwen (richtlijn)

- **Liever een dependency** wanneer die een hele bug-klasse of herhaald boilerplate oplost (bijv. **TanStack Query** voor server state; een CSV-library alleen als `internal/revolutcsv` tekort schiet).
- **Liever stdlib of kleine interne helper** voor beknopte dingen: centafronding, één `DecodeJSON`, duidelijke foutmapping — zolang `float64` en JSON acceptabel blijven voor jullie use case.
- **Afronding / boekhoudkundige exactheid:** pas **decimal**-achtige packages overwegen (bijv. `shopspring/decimal`) als float-problemen echt spelen, niet “voor netjes”.
- **Vermijden:** zware UI-kits of ORM’s tussentijds invoeren zolang **Chi + pgx + handgeschreven SQL** en de huidige stack al bij de codebase passen.
