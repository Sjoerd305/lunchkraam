# Tostikaart

Webapp voor tostikaarten (10 knipjes per kaart, 1 tosti = 1 knipje): Google Workspace-login, PostgreSQL, handmatige betaling via Tikkie/overschrijving en admin die kaarten toekent.

## Vereisten

- Go 1.23+
- Docker (voor Postgres of volledige stack)

## Lokaal (alleen Postgres in Docker)

```bash
cp .env.example .env
# Vul .env: POSTGRES_* en DATABASE_URL moeten dezelfde credentials gebruiken; daarnaast Google OAuth, SESSION_SECRET, …
docker compose up -d postgres
go run ./cmd/server
```

Open `http://localhost:8080`. Zet in Google Cloud Console de redirect-URI gelijk aan `OAUTH_REDIRECT_URL`.

## Alles in Docker

```bash
cp .env.example .env
# Vul .env (o.a. POSTGRES_*, Google OAuth, SESSION_SECRET). Compose bouwt DATABASE_URL voor de app-container uit POSTGRES_*.
docker compose up --build
```

## Admin

Zet je e-mail in `BOOTSTRAP_ADMIN_EMAILS`. Na inloggen heb je toegang tot **Admin → Openstaande aanvragen**.

## Milieuvariabelen

Zie [.env.example](.env.example).
