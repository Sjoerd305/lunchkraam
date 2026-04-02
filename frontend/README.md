# Lunchkraam frontend

React + TypeScript + Vite-SPA voor de Lunchkraam-webapp. In productie wordt `npm run build` tijdens de Docker-build gekopieerd naar `frontend/dist` en door de Go-server geserveerd.

## Vereisten

- **Node.js 24+** (zoals in de root-`Dockerfile`)

## Lokaal naast de Go-backend

1. Start de backend op poort **8080** (bijv. `go run ./cmd/server` vanaf de reporoot).
2. In deze map:

```bash
npm ci
npm run dev
```

Vite proxy’t `/api` en `/ws` naar `127.0.0.1:8080` (zie `vite.config.ts`).

## API-contract

Responses worden in de UI gevalideerd met Zod: `src/api.ts` en `src/api.schemas.ts`. Zie ook de root-[README](../README.md) (sectie Frontend API-contracten).

## Meer documentatie

- Runbook, rollen, Docker: [README](../README.md)
- Architectuur en Mermaid-diagrammen: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
