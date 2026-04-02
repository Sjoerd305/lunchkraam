# Lunchkraam

Webapp voor **tostikaarten** en **avondetenkaarten** (beide met 10 knipjes op de kaart). Leden loggen in via **Google Workspace** of een **lokale gebruikersnaam/wachtwoord**, beheren kaarten via het dashboard en **Kaart kopen** (`/buy`), en kunnen **tosti’s bestellen** (1 tosti = 1 knipje; meerdere stuks per bestelling mogelijk). Zonder vrije digitale knipjes kan iemand met een **fysieke tostikaart** bestellen; de kraam knipt dan op de kaart en de app houdt een **schatting** van resterende knipjes bij. Fysieke kaarten zijn in de app **read-only** en niet digitaal bruikbaar. Betaling verloopt handmatig (Tikkie/overschrijving), en fysieke kaartverkoop kan bij de kraam met **tikkie** of **contant** worden geregistreerd. Een **admin** accordeert aanvragen en beheert gebruikers. Operators zien de tosti-wachtrij op de **kraampagina** en kunnen daar ook **avondeten per datum** afboeken.

- **PostgreSQL** + migraties (goose)
- **SPA** (React/Vite), in productie door de Go-server geserveerd
- **Realtime**: WebSocket-hints voor kraam en “mijn tosti” (lijsten verversen zonder polling)
- **Instellingen**: o.a. Tikkie-URL’s en tarieven per kaartsoort via admin (of defaults in `.env`)

## Documentatie

- Architectuur, code-indeling en Mermaid-diagrammen (runtime, CI/CD, OAuth, realtime, voorbeeldflow): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Vereisten

- **Go 1.25+** (in `go.mod` staat `toolchain go1.25.8`; oudere installs halen die toolchain zo nodig binnen)
- **Node.js 24+** (frontend bouwen of `npm run dev`; de Docker-build gebruikt **Node 24**, zie `Dockerfile`)
- **Docker** (optioneel: Postgres of volledige stack)

## Lokaal (alleen Postgres in Docker)

```bash
cp .env.example .env
# Vul .env: POSTGRES_* en DATABASE_URL moeten dezelfde credentials gebruiken; daarnaast Google OAuth, SESSION_SECRET, ALLOWED_GOOGLE_DOMAIN, …
docker compose up -d postgres
go run ./cmd/server
```

Open `http://localhost:8080`. In Google Cloud Console moet de redirect-URI exact overeenkomen met `OAUTH_REDIRECT_URL`.

### Frontend apart ontwikkelen (Vite)

```bash
cd frontend && npm ci && npm run dev
```

De dev-server proxy’t `/api` en `/ws` naar de Go-backend op poort **8080** (`vite.config.ts` gebruikt `127.0.0.1`); draai tegelijk `go run ./cmd/server`.

## Alles in Docker

```bash
cp .env.example .env
# Vul .env (o.a. POSTGRES_*, Google OAuth, SESSION_SECRET). Compose zet DATABASE_URL voor de app-container op basis van POSTGRES_*.
docker compose up --build
```

Tip: geef bij een handmatige productiebuild een versie mee, zodat de footer de commit toont:

```bash
APP_VERSION="$(git rev-parse --short HEAD)" docker compose up -d --build
```

## Productie achter HTTPS (bijv. Cloudflare Tunnel)

Zet minimaal:

- `PUBLIC_BASE_URL=https://jouw-domein.nl` (geen trailing slash)
- `OAUTH_REDIRECT_URL` op dezelfde origin, eindigend op `/auth/google/callback`
- `TRUST_PROXY_HEADERS=true` als TLS bij de edge eindigt en de app HTTP ziet (Secure cookies, `X-Forwarded-Proto`, optionele HTTP→HTTPS-redirect)

Zie [.env.example](.env.example) voor uitleg bij `COOKIE_SECURE` en tunnel-HTTP.

## Rollen

- **Bootstrap-admin**: zet e-mail(s) in `BOOTSTRAP_ADMIN_EMAILS`; na inloggen heb je adminrechten (dashboard, verkoopcijfers, accounts, instellingen, **betalingswachtrij**, **boodschappen & uitgaven**). In instellingen kun je o.a. een aparte Tikkie voor de avondetenkaart zetten (aanvullend op `.env`).
- **Operator (matroos)**: kraampagina (tosti-wachtrij incl. fysieke kaart, kaarten zoeken, avondeten afboeken). Kan **fysieke kaartverkoop registreren** (tikkie/contant) en de **fysieke knipjesschatting** bijstellen. Onder **Beheer**: **Betalingswachtrij** (accorderen/weigeren) en **Boodschappen** (uitgaven registreren). Een admin zet operator-rechten in de UI bij **lokale** gebruikers; voor Google-accounts bestaat die schakelaar niet (alleen handmatig in de database als je dat nodig hebt).
- **Matroos jeugd** (vlag op gebruiker): alleen wie deze vlag heeft ziet de **avondetenkaart** op Kaart kopen. Admins zetten dat bij **lokale** gebruikers in de UI; voor Google-accounts geldt hetzelfde patroon als bij operator (zo nodig handmatig in de database).

Geaccordeerde verkopen leggen het tarief vast zodat latere wijzigingen van `PAYMENT_AMOUNT_EUR` / admin-tarieven de historische omzet niet verstoren.

## Fysieke kaarten

- Fysieke kaarten worden bij verkoop aan de kraam geregistreerd met betaalmiddel `tikkie` of `contant`.
- De app toont fysieke kaarten als **read-only** met een schatting van resterende knipjes.
- Digitale acties gebruiken alleen online kaarten; fysieke kaarten zijn niet digitaal inzetbaar.
- Bij fysieke tosti-bestellingen boekt de app de schatting af bij leveren door de kraam.
- Operator/admin kan de schatting handmatig corrigeren in de kraampagina.

## Databasebackups

- Lokaal dumpen (docker-compose Postgres): [`scripts/backup-database.sh`](scripts/backup-database.sh); terugzetten: [`scripts/restore-database.sh`](scripts/restore-database.sh) (zie commentaar in de scripts).
- Optioneel: [`scripts/upload-backups-to-drive.sh`](scripts/upload-backups-to-drive.sh) — dump + upload via rclone met retentie op de remote (vereisten en omgevingsvariabelen staan in het script).
- Bonfoto's voor boodschappen staan standaard in `RECEIPTS_DIR` (`data/receipts`) en worden in Docker persistent opgeslagen via volume `receiptdata`.
- Het uploadscript sync't (indien aanwezig) ook `RECEIPTS_DIR` naar `${RCLONE_DEST}/receipts`.

### Backup/restore voorbeelden

```bash
# Maak database-backup + (indien aanwezig) bonfoto-archive
scripts/backup-database.sh

# Restore: auto-detect bonfoto-archive met dezelfde timestamp
scripts/restore-database.sh backups/lunchkraam-20260401-031500.sql.gz

# Restore: expliciet bonfoto-archive kiezen
scripts/restore-database.sh \
  --receipts backups/lunchkraam-20260401-031500-receipts.tar.gz \
  backups/lunchkraam-20260401-031500.sql.gz

# Restore: alleen database, bonfoto's overslaan
scripts/restore-database.sh --skip-receipts backups/lunchkraam-20260401-031500.sql.gz
```

## Frontend API-contracten

- De frontend valideert `res.json()`-payloads in `frontend/src/api.ts` met **Zod**.
- Definieer response-schema's centraal in `frontend/src/api.schemas.ts`.
- Houd endpoint-functies klein: `fetch` + `parseApiResponse(...)` + `return`.
- Gebruik default-first parsing (`.default()` / `.catch()`) voor niet-kritieke velden zodat UI's robuust blijven.
- Components/pages werken alleen met reeds gevalideerde types; geen losse shape-checks in UI-code.

## Milieuvariabelen

Zie [.env.example](.env.example). Gebruik je de avondetenkaart, zet dan minimaal ook **TIKKIE_URL_AVONDETEN** en **AVONDETEN_PAYMENT_AMOUNT_EUR** (of de equivalenten in de admin-instellingen).
Voor bonfoto-opslag kun je optioneel **RECEIPTS_DIR** aanpassen (default: `data/receipts`).
