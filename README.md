# Lunchkraam

Webapp voor **tostikaarten** en **avondetenkaarten** (beide met 10 knipjes op de kaart). Leden loggen in via **Google Workspace** of een **lokale gebruikersnaam/wachtwoord**, beheren kaarten via het dashboard en **Kaart kopen** (`/buy`), en kunnen **tosti’s bestellen** (1 tosti = 1 knipje; meerdere stuks per bestelling mogelijk). Zonder vrije digitale knipjes kan iemand met een **fysieke tostikaart** bestellen; de kraam knipt dan op de kaart (geen afboeking in de app). Betaling verloopt handmatig (Tikkie/overschrijving); een **admin** accordeert aanvragen en beheert gebruikers. Operators zien de tosti-wachtrij op de **kraampagina** en kunnen daar ook **avondeten per datum** afboeken.

- **PostgreSQL** + migraties (goose)
- **SPA** (React/Vite), in productie door de Go-server geserveerd
- **Realtime**: WebSocket-hints voor kraam en “mijn tosti” (lijsten verversen zonder polling)
- **Instellingen**: o.a. Tikkie-URL’s en tarieven per kaartsoort via admin (of defaults in `.env`)

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

## Productie achter HTTPS (bijv. Cloudflare Tunnel)

Zet minimaal:

- `PUBLIC_BASE_URL=https://jouw-domein.nl` (geen trailing slash)
- `OAUTH_REDIRECT_URL` op dezelfde origin, eindigend op `/auth/google/callback`
- `TRUST_PROXY_HEADERS=true` als TLS bij de edge eindigt en de app HTTP ziet (Secure cookies, `X-Forwarded-Proto`, optionele HTTP→HTTPS-redirect)

Zie [.env.example](.env.example) voor uitleg bij `COOKIE_SECURE` en tunnel-HTTP.

## Rollen

- **Bootstrap-admin**: zet e-mail(s) in `BOOTSTRAP_ADMIN_EMAILS`; na inloggen heb je adminrechten (dashboard, verkoopcijfers, accounts, instellingen, **betalingswachtrij**, **boodschappen & uitgaven**). In instellingen kun je o.a. een aparte Tikkie voor de avondetenkaart zetten (aanvullend op `.env`).
- **Operator (matroos)**: kraampagina (tosti-wachtrij incl. fysieke kaart, kaarten zoeken, avondeten afboeken). Onder **Beheer**: **Betalingswachtrij** (accorderen/weigeren) en **Boodschappen** (uitgaven registreren). Een admin zet operator-rechten in de UI bij **lokale** gebruikers; voor Google-accounts bestaat die schakelaar niet (alleen handmatig in de database als je dat nodig hebt).
- **Matroos jeugd** (vlag op gebruiker): alleen wie deze vlag heeft ziet de **avondetenkaart** op Kaart kopen. Admins zetten dat bij **lokale** gebruikers in de UI; voor Google-accounts geldt hetzelfde patroon als bij operator (zo nodig handmatig in de database).

Geaccordeerde verkopen leggen het tarief vast zodat latere wijzigingen van `PAYMENT_AMOUNT_EUR` / admin-tarieven de historische omzet niet verstoren.

## Databasebackups

- Lokaal dumpen (docker-compose Postgres): [`scripts/backup-database.sh`](scripts/backup-database.sh); terugzetten: [`scripts/restore-database.sh`](scripts/restore-database.sh) (zie commentaar in de scripts).
- Optioneel: [`scripts/upload-backups-to-drive.sh`](scripts/upload-backups-to-drive.sh) — dump + upload via rclone met retentie op de remote (vereisten en omgevingsvariabelen staan in het script).

## Frontend API-contracten

- De frontend valideert `res.json()`-payloads in `frontend/src/api.ts` met **Zod**.
- Definieer response-schema's centraal in `frontend/src/api.schemas.ts`.
- Houd endpoint-functies klein: `fetch` + `parseApiResponse(...)` + `return`.
- Gebruik default-first parsing (`.default()` / `.catch()`) voor niet-kritieke velden zodat UI's robuust blijven.
- Components/pages werken alleen met reeds gevalideerde types; geen losse shape-checks in UI-code.

## Milieuvariabelen

Zie [.env.example](.env.example). Gebruik je de avondetenkaart, zet dan minimaal ook **TIKKIE_URL_AVONDETEN** en **AVONDETEN_PAYMENT_AMOUNT_EUR** (of de equivalenten in de admin-instellingen).
