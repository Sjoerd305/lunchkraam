# Architectuur Lunchkraam

Dit document vult de [README](../README.md) aan met een beknopte technische uitleg en Mermaid-diagrammen. De bron voor API-routes blijft [`cmd/server/main.go`](../cmd/server/main.go).

## Code-indeling (backend en frontend)

- **`cmd/server`**: HTTP-server, routing, SPA-static files, migraties bij start.
- **`internal/config`**: Omgevingsvariabelen en defaults.
- **`internal/db`**: Postgres-verbinding en goose-migraties.
- **`internal/store`**: Database-queries en domeinlogica.
- **`internal/handlers`**: HTTP-handlers (REST + OAuth-callbacks + WebSocket-upgrade).
- **`internal/middleware`**: Sessie, CSRF-bescherming op `/api`, auth/rollen, rate limits.
- **`internal/auth`**: Google OAuth-config en profiel/domain-checks.
- **`internal/realtime`**: Hub voor WebSocket-“hints”.
- **`frontend/`**: React/Vite-SPA; [`frontend/src/api.ts`](../frontend/src/api.ts) + [`api.schemas.ts`](../frontend/src/api.schemas.ts) voor Zod-gevalideerde API-responses.

## Runtime en deployment (hoog niveau)

In productie draait één Go-binary die de gebouwde SPA uit `FRONTEND_DIST` serveert en tegelijk `/api` en `/ws` afhandelt. Postgres en bonfoto’s volgen uit [docker-compose.yml](../docker-compose.yml) en de [Dockerfile](../Dockerfile) (multi-stage: Node build → Go build → Alpine image).

```mermaid
flowchart LR
  subgraph client [Client]
    browser[Browser_SPA]
  end
  subgraph host [Host]
    app[Go_server_cmd_server]
    dist[FRONTEND_DIST_static]
    vol[Volume_receiptdata]
  end
  db[(PostgreSQL)]
  browser -->|"HTTPS_HTTP_REST_WebSocket"| app
  app --> dist
  app --> db
  app --> vol
```

## CI/CD

Bij push naar `main` (of handmatige dispatch) draait eerst de check-job op GitHub-hosted runners; daarna deploy op een self-hosted runner met Docker Compose. Zie [.github/workflows/deploy.yml](../.github/workflows/deploy.yml).

```mermaid
flowchart TD
  trig[Push_naar_main_of_workflow_dispatch] --> v1
  subgraph verifyJob [Job_verify]
    v1[npm_ci_en_lint_frontend]
    v2[go_vet_en_go_build]
    v3[docker_build_CI_image]
    v1 --> v2 --> v3
  end
  v3 --> cond{Branch_is_main}
  cond -->|nee| done[Einde]
  cond -->|ja| e
  subgraph deployJob [Job_deploy_self_hosted]
    e[Kopieer_productie_env]
    c["APP_VERSION_uit_GITHUB_SHA_docker_compose_up_build"]
    e --> c
  end
  c --> done
```

## Google OAuth en sessie

Inloggen met Google: state in de cookie-sessie, redirect naar Google, callback met code, token exchange, userinfo, domeincheck (`ALLOWED_GOOGLE_DOMAIN`), gebruiker upserten, `user_id` in sessie. Lokale accounts gebruiken een apart JSON-endpoint (`POST /api/auth/local/login`) met dezelfde sessie-cookie daarna.

```mermaid
sequenceDiagram
  participant U as Gebruiker
  participant B as Browser
  participant S as Lunchkraam_server
  participant G as Google

  U->>B: Klik_inloggen_met_Google
  B->>S: GET_auth_google
  S->>S: Genereer_state_sla_in_sessie
  S-->>B: Redirect_naar_Google
  B->>G: Autoriseer_oauth
  G-->>B: Redirect_callback_met_code
  B->>S: GET_auth_google_callback
  S->>S: Controleer_state
  S->>G: Exchange_code_voor_token
  G-->>S: Access_token
  S->>G: Haal_userinfo_op
  G-->>S: Profiel_email_domein
  S->>S: Controleer_domein_UpsertUser
  S->>S: Zet_user_id_in_sessie
  S-->>B: Redirect_naar_startpagina
```

## Realtime via WebSockets

De hub stuurt geen volledige payloads door de socket, maar **hints** om clients te laten weten dat ze relevante REST-endpoints opnieuw moeten ophalen. Twee paden: kraam (operator/admin) en “mijn tosti” (ingelogd lid).

```mermaid
flowchart TD
  hub[realtime_Hub]
  hub --> wsK["GET_ws_kraam_operator_admin"]
  hub --> wsM["GET_ws_mijn_tosti_lid"]
  wsK --> uiK[Kraam_Beheer_UI_refresh]
  wsM --> uiM[Mijn_tosti_UI_refresh]
  uiK --> restK[Opnieuw_GET_api_operator_en_admin]
  uiM --> restM[Opnieuw_GET_api_tosti_mine]
```

## Voorbeelddomein: digitale kaart kopen

Een lid vraagt een kaart aan; een admin of operator accordeert in de betalingswachtrij. De server voltooit de aanvraag en legt o.a. het accorderingsbedrag vast. De UI parseert antwoorden met Zod (`api.schemas.ts`).

```mermaid
sequenceDiagram
  participant L as Lid_SPA
  participant A as Server_store
  participant O as Operator_admin_SPA

  L->>A: POST_api_buy_request
  A-->>L: Aanvraag_in_wachtrij
  O->>A: GET_api_admin_requests
  A-->>O: Lijst_openstaand
  O->>A: POST_api_admin_requests_id_fulfill
  A->>A: FulfillCardRequest_kaart_actief
  A-->>O: OK
  Note over L,A: Hub_kan_hint_sturen_voor_vernieuwde_lijsten
```

## Verder lezen

- Runbook en rollen: [README](../README.md)
- Omgevingsvariabelen: [.env.example](../.env.example)
