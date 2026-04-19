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

*Last reviewed: 2026-04-19*

- [x] Gedeelde **EUR cent-rounding** helper (`internal/money.RoundEUR`; vervangt `math.Round(v*100)/100` bij JSON-uitvoer en rapportage).
- [x] Gedeelde **JSON body decode**: `httpx.ReadJSON` / `httpx.ReadJSONAllowEmpty` i.p.v. overal `json.NewDecoder(http.MaxBytesReader(…))` + uniforme 400 bij parse-fout.
- [x] **Store error → HTTP** centraal in [internal/httpx/store_errors.go](internal/httpx/store_errors.go) (`RespondStoreNotFound`, `WriteBankCreditStoreError`, tosti/kaart/avondeten/local-password helpers); handlers roepen die aan i.p.v. lange `errors.Is`-ketens.
- [x] **Logging**: `log/slog` met structured fields in de aangepaste handlers + [internal/httpx/json.go](internal/httpx/json.go); `slog.SetDefault` in [cmd/server/main.go](cmd/server/main.go). (`log` blijft voor `log.Fatalf` bij startup.)

## Code health — frontend

*Last reviewed: 2026-04-19*

- [x] Gedeelde **`formatEUR`** / **`roundCents`** in [frontend/src/utils/formatMoney.ts](frontend/src/utils/formatMoney.ts) (`Intl.NumberFormat` NL + EUR).
- [x] **Admin dashboard**-euro’s via `formatEUR` (geen losse `toFixed(2)`-strings).
- [x] **Admin grafieken** (`AdminSalesCharts`): `roundCents` i.p.v. herhaalde `Math.round(x*100)/100`.
- [x] **Zod** — response- en payload-types in `api.ts` via `z.infer<typeof …Schema>` gekoppeld aan [frontend/src/api.schemas.ts](frontend/src/api.schemas.ts) (sub-schema’s geëxporteerd waar nodig).
- [x] Optioneel: **`apiRequest`-factory** (`apiJson` / `apiVoid` / `apiFormJson` in [frontend/src/apiRequest.ts](frontend/src/apiRequest.ts)) — `api.ts` gebruikt dit centraal.
- [x] Optioneel: **TanStack Query** — `QueryClientProvider` in [frontend/src/main.tsx](frontend/src/main.tsx); admin-pagina’s met server state gebruiken `useQuery` / `invalidateQueries` (o.a. dashboard, requests, users, settings, sales charts, expenses overview, finance, shop expenses).

### Code review / vervolg (korte scan 2026-04-19)

- **Admin-fetchpatroon:** geen resterende `useEffect`+`void api.*`-loads op admin-pagina’s; mutaties invalidaten gerichte `queryKeys`.
- **Dubbele jaar/omzet-logica:** zelfde `salesYears` + `salesStats` + jaarselectie staat op meerdere plekken — optioneel één kleine hook (`useAdminSalesYearQueries` o.i.d.) om drift te beperken.
- **Buiten admin:** `KraamPage`, `CardsPage`, `BuyPage`, `OrderTostiPage` houden nog **lokale state + handmatige refresh**; Query is daar optioneel tot het patroon lastig wordt.
- **Backend** (ongewijzigd t.o.v. eerdere lijst): compactere store-error→HTTP mapping en `slog` i.p.v. losse `log.Printf` blijven nuttige vervolgstappen (zie secties hierboven).

## Libraries vs zelf bouwen (richtlijn)

- **Liever een dependency** wanneer die een hele bug-klasse of herhaald boilerplate oplost (bijv. **TanStack Query** voor server state; een CSV-library alleen als `internal/revolutcsv` tekort schiet).
- **Liever stdlib of kleine interne helper** voor beknopte dingen: centafronding, één `DecodeJSON`, duidelijke foutmapping — zolang `float64` en JSON acceptabel blijven voor jullie use case.
- **Afronding / boekhoudkundige exactheid:** pas **decimal**-achtige packages overwegen (bijv. `shopspring/decimal`) als float-problemen echt spelen, niet “voor netjes”.
- **Vermijden:** zware UI-kits of ORM’s tussentijds invoeren zolang **Chi + pgx + handgeschreven SQL** en de huidige stack al bij de codebase passen.
