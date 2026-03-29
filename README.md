# Tostikaart

Webapp voor tostikaarten (10 knipjes per kaart, 1 tosti = 1 knipje): leden loggen in via **Google Workspace** of een **lokale gebruikersnaam/wachtwoord**, beheren kaarten en kunnen **tosti’s bestellen**; operators zien de wachtrij op de **kraampagina**. Betaling verloopt handmatig (Tikkie/overschrijving); een **admin** accordeert aanvragen en beheert gebruikers.

- **PostgreSQL** + migraties (goose)
- **SPA** (React/Vite), in productie door de Go-server geserveerd
- **Realtime**: WebSocket-hints voor kraam en “mijn tosti” (lijsten verversen zonder polling)

## Vereisten

- **Go 1.25+** (in `go.mod` staat `toolchain go1.25.8`; oudere installs halen die toolchain zo nodig binnen)
- **Node.js 20+** (frontend bouwen of `npm run dev`)
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

De dev-server proxy’t API en WebSockets naar de Go-backend (standaard `http://localhost:8080`); draai tegelijk `go run ./cmd/server`.

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

- **Bootstrap-admin**: zet e-mail(s) in `BOOTSTRAP_ADMIN_EMAILS`; na inloggen heb je adminrechten (dashboard, verkoopcijfers, accounts, instellingen, betalingswachtrij).
- **Operator (matroos)**: kraampagina (tosti-wachtrij, kaarten zoeken), betalingswachtrij accorderen/weigeren, en het menu **Betalingen** naar dezelfde wachtrij.

## Milieuvariabelen

Zie [.env.example](.env.example).
