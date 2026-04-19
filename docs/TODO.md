# TODO — financiën lunchkraam / Revolut

## Principe: waarheid vs controle

- **Digitale geldstromen op de Revolut-rekening:** alleen vastleggen via **Revolut-import** (één bron van waarheid voor wat er echt op de rekening gebeurt).
- **Verkopen (kaarten, tellingen):** wél **bijhouden**, maar **niet** als financiële waarheid naast de bank — gebruiken als **controle op de werkelijkheid**: lopen we **voor** op de rekening, **achter**, of is het **synchroon** met wat Revolut toont?
- **Handmatig registreren** blijft zinvol voor wat **niet** (of niet betrouwbaar) via Revolut terugkomt: contant, correcties, uitzonderingen — zonder digitale inkomsten dubbel te boeken.

## Revolut vs tostikraam-verkoop

- [ ] Overzicht **Revolut-saldo / mutaties** afzetten tegen **verwachte omzet uit verkoopregistratie** (verschil zichtbaar maken: voor / achter / synchroon).
- [ ] **Avondeten** van dezelfde Revolut-rekening **anders labelen** dan lunchkraam-verkoop of standaarduitgaven (eigen categorie of doel), zodat de vergelijking met “alleen tosti” niet vervuild raakt.

## Losse posten (buiten digitale Revolut-lijn)

- [ ] **Handmatige uitgaven / correcties** voor alles wat **niet** uit de import komt, o.a.:
  - contant;
  - terugbetalingen / afspraken met andere speltakken of gasten zonder dezelfde flow als matrozenkaarten.
- [ ] Optioneel: **toelichting of tags** bij importregels (bijv. afwijkende Tikkie-groep) als **administratieve context**, zonder een tweede gelijke boeking te maken.

## Nog uit te werken in product / UI

- [ ] **Verkoopcontrole-scherm of rapport:** verwacht (uit verkopen) vs werkelijk (Revolut) per periode, met duidelijke legenda.
- [ ] Documentatie voor vrijwilligers: **stappenplan** — wat komt uit import, wat vul je handmatig in, hoe lees je “voor/achter”.

## Code health — backend

*Last reviewed: 2026-04-19*

- [x] Gedeelde **EUR cent-rounding** helper (`internal/money.RoundEUR`; vervangt `math.Round(v*100)/100` bij JSON-uitvoer en rapportage).
- [x] Gedeelde **JSON body decode**: `httpx.ReadJSON` / `httpx.ReadJSONAllowEmpty` i.p.v. overal `json.NewDecoder(http.MaxBytesReader(…))` + uniforme 400 bij parse-fout.
- [ ] **Store error → HTTP** compacter: centrale of domein-`mapStoreError` i.p.v. lange `errors.Is`-ketens per handler; later optioneel getypeerde errors + `errors.As` (zie repo coding standards).
- [ ] **Logging**: waar nu `log.Printf` in handlers staat, richting `log/slog` + struct fields bij grotere wijzigingen (lage prioriteit).

## Code health — frontend

*Last reviewed: 2026-04-19*

- [x] Gedeelde **`formatEUR`** / **`roundCents`** in [frontend/src/utils/formatMoney.ts](frontend/src/utils/formatMoney.ts) (`Intl.NumberFormat` NL + EUR).
- [x] **Admin dashboard**-euro’s via `formatEUR` (geen losse `toFixed(2)`-strings).
- [x] **Admin grafieken** (`AdminSalesCharts`): `roundCents` i.p.v. herhaalde `Math.round(x*100)/100`.
- [ ] Optioneel: **Zod** — response types deels uit schema’s `z.infer` of factory `apiRequest` om drift met `api.ts` te beperken.
- [ ] Optioneel: **TanStack Query** als `useEffect`+fetch+loading+error+refetch op veel admin-pagina’s gaat kopiëren (nu nog niet strikt nodig).

## Libraries vs zelf bouwen (richtlijn)

- **Liever een dependency** wanneer die een hele bug-klasse of herhaald boilerplate oplost (bijv. **TanStack Query** voor server state; een CSV-library alleen als `internal/revolutcsv` tekort schiet).
- **Liever stdlib of kleine interne helper** voor beknopte dingen: centafronding, één `DecodeJSON`, duidelijke foutmapping — zolang `float64` en JSON acceptabel blijven voor jullie use case.
- **Afronding / boekhoudkundige exactheid:** pas **decimal**-achtige packages overwegen (bijv. `shopspring/decimal`) als float-problemen echt spelen, niet “voor netjes”.
- **Vermijden:** zware UI-kits of ORM’s tussentijds invoeren zolang **Chi + pgx + handgeschreven SQL** en de huidige stack al bij de codebase passen.
