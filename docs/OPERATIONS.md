# WhatsApp Connector: Technical and Operations Guide

A single-tenant administrator console and API for linking WhatsApp accounts and sending controlled, consent-based, one-to-one text messages. It provides QR pairing, recipient-number checks, idempotent sends, message status history, encrypted WhatsApp authentication persistence, and audit records.

This is a public, open-source reference MVP distributed under the MIT License. It is not affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp LLC or Meta Platforms, Inc. WhatsApp and Meta are trademarks of their respective owners.

The public repository contains no real credentials or session state. `.env.example` contains development examples that must be replaced. Local `.env` files, database dumps, Docker volumes, encryption keys, and Baileys session directories are intentionally excluded from Git and Docker build contexts. This project does not implement the Meta Cloud API, inbound messaging, campaigns, bulk messaging, or spam tooling.

Before publishing a fork, inspect the complete Git diff and staged file list. Never upload a local `.env`, PostgreSQL volume or dump, QR screenshot, phone number, message content, cookie, access token, encryption key, or WhatsApp authentication record. If a secret reaches Git history, revoke or rotate it immediately; adding it to `.gitignore` afterward is not sufficient.

Security reports must follow [`SECURITY.md`](../SECURITY.md) and must not be posted as public issues. Contributions must follow [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Public Repository Checklist

This project is safe to publish only when local runtime data remains outside the Git index. `.gitignore` protects normal Git workflows, but it cannot protect manual web uploads, forced additions, old Git history, screenshots, pasted logs, or files committed before an ignore rule existed.

Before the first public push:

```sh
git init
git add .
git status --short
git diff --cached --check
git ls-files .env
```

The last command must produce no output. Review every staged path before committing. In particular, confirm that the staged files contain `.env.example` but not `.env`, and contain Prisma migrations but not PostgreSQL dumps, Docker volume data, session folders, build output, or `node_modules`.

Also:

- Enable GitHub secret scanning and push protection for the repository.
- Enable private vulnerability reporting under the repository Security settings.
- Do not use `git add -f` for ignored configuration or session files.
- Rotate any credential that has ever appeared in a commit, patch, issue, chat transcript, screenshot, or CI log.
- Keep production secrets in a secret manager; GitHub Actions in this repository requires no real application secrets.
- Inspect `git log --all --stat` and the complete commit history before changing a private repository to public.
- Log out linked test devices before sharing database exports or debugging artifacts. A local Docker volume is not committed by Git, but its contents remain sensitive.

## Warnings

> [!WARNING]
> This connection uses WhatsApp’s linked-device mechanism and is not the official Meta WhatsApp Business Platform. Sessions may disconnect, WhatsApp changes may affect functionality, and improper automated messaging may cause account restrictions.

A linked-device QR code grants the service access to act as the linked WhatsApp account. Show it only to an authorized operator, run the service only on trusted infrastructure, protect PostgreSQL and `SESSION_ENCRYPTION_KEY`, and use TLS for any non-local deployment.

Use this connector only for individual recipients who have explicitly consented to the message. Do not use it for bulk sends, unsolicited messages, spam, or attempts to evade WhatsApp restrictions. Review applicable law, WhatsApp terms, and organizational retention requirements before use.

## Quick Start After Cloning

This is the shortest path for evaluating the project locally. It requires Node.js, npm, Docker Compose, and an authorized WhatsApp account. Prefer a dedicated test account rather than a primary personal or business account. Run these commands from the cloned repository root:

```sh
npm run setup:env
docker compose up --build
```

`npm run setup:env` creates an ignored `.env` with random local secrets, refuses to overwrite an existing file, and prints the generated local administrator password once. It does not print the session secret or encryption key.

After all three containers report healthy:

1. Open `http://localhost:5173`.
2. Log in as `admin@example.com` with the password printed by `npm run setup:env`.
3. Create the suggested `default` WhatsApp instance.
4. Select **Connect**.
5. On the authorized phone, open WhatsApp, open **Linked Devices**, select **Link a Device**, and scan the QR.
6. Wait for `CONNECTED`.
7. Open **Send a message**, enter one consenting recipient in international `+` format, and select **Check number**.
8. Enter a test message, confirm the consent checkbox, and send it once.
9. Treat `ACCEPTED` only as provider acceptance, not proof of delivery or reading.

Health checks:

```sh
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Stop the application without deleting data:

```sh
docker compose down
```

To run automated tests without connecting to WhatsApp:

```sh
npm ci
npm run db:generate
npm test
```

Automated tests use a mock WhatsApp provider. QR linking and actual sending require a manual test with an authorized, consenting account and recipient. If ports 3000 or 5173 are occupied, update `API_PORT`, `API_URL`, `API_WS_URL`, `WEB_PORT`, and `APP_URL` together in `.env` before building.

## Architecture

The root is an npm workspace with two applications:

```text
apps/
  api/
    prisma/                 PostgreSQL schema, migration, and administrator seed
    src/config/             Environment validation, Prisma, and logging
    src/modules/auth/       Login, database sessions, cookies, and CSRF
    src/modules/whatsapp/   Provider interface, Baileys adapter, lifecycle, and events
    src/modules/messages/   Number checks, sends, idempotency, and history
    src/services/           Audit, retention, and in-memory rate limiting
    src/websocket/          Authenticated Socket.IO server
    tests/                  Unit and API integration tests with fakes
  web/
    src/auth/               Browser authentication state
    src/components/         Shared console UI
    src/lib/                HTTP and Socket.IO clients
    src/pages/              Login, dashboard, connect, send, and history pages
```

`apps/api` is a Fastify service. It validates administrator sessions, owns live Baileys sockets, persists application and WhatsApp state through Prisma, and publishes provider events through Socket.IO. Message routes depend on the `WhatsAppProvider` interface in `apps/api/src/modules/whatsapp/whatsapp.types.ts`; the current implementation is `BaileysWhatsAppProvider`.

`apps/web` is a React single-page application. In development Vite serves it directly. The Docker image builds static assets and serves them from unprivileged Nginx on container port 8080.

The request flow is:

```text
Browser -> React/Vite or Nginx -> Fastify HTTP and Socket.IO
                                      |-> Auth and CSRF -> PostgreSQL
                                      |-> Message service -> WhatsAppProvider
                                      |                         |-> Baileys -> WhatsApp
                                      |                         `-> encrypted auth records -> PostgreSQL
                                      `-> audit, message history, and retention -> PostgreSQL
```

## Stack

Direct runtime and build dependencies are pinned in `package-lock.json`:

| Area | Version |
| --- | --- |
| Node.js | `>=20.19.0`; Docker builds and runs on Node 22 Bookworm Slim |
| npm | `>=10.0.0` |
| TypeScript | `5.8.3` |
| Fastify | `5.10.0` |
| Fastify plugins | `@fastify/cookie` `11.0.2`, `@fastify/cors` `11.0.1`, `@fastify/helmet` `13.0.1` |
| Prisma and Prisma Client | `6.12.0` |
| PostgreSQL | `postgres:16-alpine` in Compose |
| Baileys | `@whiskeysockets/baileys` exactly `7.0.0-rc13` |
| Socket.IO server/client | `4.8.1` |
| React and React DOM | `19.1.0` |
| React Router | `7.18.1` |
| Vite and React plugin | `vite` `7.3.6`, `@vitejs/plugin-react` `4.6.0` |
| CSS toolchain | Tailwind CSS `3.4.17`, PostCSS `8.5.19`, Autoprefixer `10.4.21` |
| Zod | `3.25.76` |
| Argon2 | `0.43.1` |
| Pino | `9.7.0` |
| Environment and QR support | `dotenv` `17.2.0`, `qrcode` `1.5.4` |
| Vitest | `3.2.7` |
| Production web server | `nginxinc/nginx-unprivileged:1.27-alpine` |

Baileys is deliberately pinned to the release candidate used by the adapter. Use `npm ci`; do not casually float or update this dependency.

## Prerequisites

For Docker operation:

- Docker Desktop or Docker Engine with Docker Compose v2.
- OpenSSL for secret generation.
- Free host ports 3000 and 5173, unless overridden.
- A phone with an authorized WhatsApp account and access to Linked Devices.
- Outbound network access from the API container to WhatsApp services.

For local development without application containers:

- Node.js `>=20.19.0` and npm `>=10.0.0`.
- PostgreSQL 16 or a compatible PostgreSQL server reachable from the host.
- OpenSSL.
- Free ports 3000 and 5173.

No Meta developer account or Meta Cloud API credentials are used because this repository has no Meta Cloud API integration.

## Environment Setup

Create the ignored local environment file:

```sh
umask 077
cp .env.example .env
```

Replace the example administrator values. Generate each sensitive value independently; do not reuse one output for multiple settings:

```sh
openssl rand -base64 32
```

Run that command once for a strong `ADMIN_PASSWORD`, once for `SESSION_SECRET`, and once for `SESSION_ENCRYPTION_KEY`. Paste each result into its corresponding `.env` line. `SESSION_SECRET` must contain at least 32 characters. `SESSION_ENCRYPTION_KEY` must decode to exactly 32 bytes; `openssl rand -base64 32` produces the required base64 form. A 64-character hexadecimal key is also accepted by the API.

The values shipped in `.env.example` are not real credentials, and its encryption-key text is intentionally not a usable 32-byte key. The API will reject missing or invalid required configuration.

| Variable | Purpose and behavior |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production`. Production enables `Secure` session and CSRF cookies. |
| `API_PORT` | API listen port locally; in Compose it selects the host port mapped to container port 3000. Default `3000`. |
| `WEB_PORT` | Compose host port mapped to Nginx container port 8080. Default `5173`. |
| `APP_URL` | Exact allowed browser origin for HTTP and Socket.IO credentialed CORS. Default `http://localhost:5173`. |
| `API_URL` | Compose build-time public API URL for the web image. Default `http://localhost:3000`. |
| `API_WS_URL` | Public Socket.IO WebSocket origin allowed by the production web CSP. Keep its host and port aligned with `API_URL`. |
| `VITE_API_URL` | API URL used by local Vite development. Compose uses `API_URL` as the `VITE_API_URL` build argument. |
| `DATABASE_URL` | Prisma PostgreSQL connection string. Compose overrides it inside the API container with `postgresql://postgres:postgres@postgres:5432/whatsapp_connector`. |
| `ADMIN_EMAIL` | Seed administrator email, normalized to lowercase. |
| `ADMIN_PASSWORD` | Seed administrator password; minimum 12 characters. See the seed caveat below. |
| `SESSION_SECRET` | HMAC secret used to hash session and CSRF tokens before database storage; minimum 32 characters. |
| `SESSION_ENCRYPTION_KEY` | 32-byte AES key for WhatsApp auth records and optional full message text. Required outside tests. |
| `STORE_FULL_MESSAGE_TEXT` | When `true`, stores full text encrypted. When `false`, full text is not stored, but a 100-character preview is still stored. Default `false`. |
| `MESSAGE_RETENTION_DAYS` | Days before previews and encrypted full text are cleared. Default `30`; allowed range 1 to 3650. |
| `IDEMPOTENCY_RETENTION_HOURS` | Hours for reuse protection on caller-provided idempotency keys. Default `24`; allowed range 1 to 8760. |
| `NUMBER_CHECK_RATE_LIMIT_PER_MINUTE` | In-memory checks per administrator per minute. Default `10`. |
| `MESSAGE_RATE_LIMIT_PER_MINUTE` | In-memory send requests per WhatsApp instance per minute. Default `5`. |
| `AUTH_FAILURE_RATE_LIMIT_PER_15_MINUTES` | In-memory failed logins per source IP per 15 minutes. Default `5`. |
| `LOG_LEVEL` | Pino level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, or `silent`. Default `info`. |

For a changed host API port, update `API_PORT`, `API_URL`, and `API_WS_URL` together before building the web image. For a changed host web port or origin, update `WEB_PORT` and `APP_URL` together. In production, set `NODE_ENV=production`, use HTTPS/WSS URLs, and terminate TLS at a trusted reverse proxy.

## Docker Startup

After securing `.env`, start the complete local stack:

```sh
docker compose up --build
```

The API image command runs these steps on every container start before serving requests:

```sh
npm run db:migrate:deploy --workspace @whatsapp-connector/api
npm run db:seed --workspace @whatsapp-connector/api
npm run start --workspace @whatsapp-connector/api
```

Therefore, `docker compose up --build` applies committed migrations and runs the administrator seed automatically. PostgreSQL must pass its health check before the API starts, and the API must pass readiness before the web container starts.

Default local URLs:

| Service | URL |
| --- | --- |
| Web console | `http://localhost:5173` |
| API and Socket.IO origin | `http://localhost:3000` |
| Liveness | `http://localhost:3000/health/live` |
| Readiness | `http://localhost:3000/health/ready` |

PostgreSQL is stored in the `postgres_data` named volume and is not published to a host port. Stop containers without deleting data with:

```sh
docker compose down
```

The Compose file is a local baseline, not a production deployment: PostgreSQL uses the fixed development password `postgres`, HTTP is unencrypted, and no external secret manager is configured.

## Local Development

Configure `DATABASE_URL` in `.env` for a PostgreSQL server reachable from the host. The example hostname `postgres` resolves inside Compose only. If a local PostgreSQL role and password are both `postgres`, the corresponding host URL is `postgresql://postgres:postgres@localhost:5432/whatsapp_connector`.

The API and Prisma workspace processes run with `apps/api` as their working directory, so they do not automatically load the root `.env`. Export the trusted root file into the current shell first. Then install exactly from the lockfile, generate Prisma Client, apply a development migration, seed the administrator, and start both workspaces:

```sh
set -a
. ./.env
set +a
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` starts Fastify through `tsx watch` on port 3000 and Vite on port 5173. Local URLs are the same defaults listed above.

## Database Commands

Run commands from the repository root:

| Task | Exact command |
| --- | --- |
| Install locked dependencies | `npm ci` |
| Generate Prisma Client | `npm run db:generate` |
| Create/apply development migrations | `npm run db:migrate` |
| Apply committed migrations in deployment | `npm run db:migrate:deploy --workspace @whatsapp-connector/api` |
| Seed the administrator | `npm run db:seed` |
| Start both development apps | `npm run dev` |
| Start the built API | `npm run start --workspace @whatsapp-connector/api` |
| Start Docker stack | `docker compose up --build` |
| Run tests | `npm test` |
| Run API tests in watch mode | `npm run test:watch --workspace @whatsapp-connector/api` |
| Type-check both workspaces | `npm run typecheck` |
| Build both workspaces | `npm run build` |

Use `db:migrate` only for development schema work because it runs `prisma migrate dev`. Deploy existing migration files with the workspace `db:migrate:deploy` command. For host-local API, Prisma, seed, test, or build commands that need application configuration, first export the root `.env` with the three `set -a`/`.`/`set +a` commands shown above. Docker injects `.env` through Compose and does not need that shell step.

### Administrator seed behavior

The seed lowercases `ADMIN_EMAIL`, hashes `ADMIN_PASSWORD` with Argon2id, and upserts by email. For a new email it creates an active `ADMIN`. For an existing email it only sets `isActive: true`; it deliberately does not update `passwordHash`.

Changing `ADMIN_PASSWORD` in `.env` and rerunning the seed does not rotate an existing administrator password. This repository has no password-change or password-reset endpoint. Password rotation requires a trusted administrative procedure that generates an Argon2id hash and intentionally updates the existing `AdminUser.passwordHash`. Do not assume a container restart rotated it. Changing `ADMIN_EMAIL` creates another administrator rather than renaming the existing one.

## Link a WhatsApp Account

1. Open `http://localhost:5173` and log in with the configured administrator email and password.
2. Create an instance. The UI defaults to instance ID `default` and name `Main operations`; IDs are immutable, 1 to 50 characters, and allow lowercase letters, numbers, hyphens, and underscores.
3. Select **Connect**. The page creates an authenticated Socket.IO connection, subscribes to that instance, and requests the provider connection.
4. On Android, open WhatsApp, open the menu, select **Linked devices**, then **Link a device**. On iPhone, open WhatsApp **Settings**, select **Linked Devices**, then **Link a Device**.
5. Scan the QR shown in the console with the authorized phone.
6. Keep the page open until the instance reports `CONNECTED` and confirm the displayed connected number.

The QR image is never returned by a REST endpoint. It is emitted only to an authenticated Socket.IO client subscribed to the instance. A QR snapshot expires after 60 seconds and is removed from API memory on expiry, connection, disconnection, or logout.

**Disconnect** ends the current socket but preserves database auth state for a later reconnect. **Log out session** asks WhatsApp to log out and deletes all stored auth records for the instance, requiring a new QR link.

## Send a Test Message

Use only a number whose owner has explicitly consented to the exact test. The service accepts individual WhatsApp recipients only, in international `+` format with 8 to 15 digits after normalization.

### From the web console

1. Confirm the selected instance is `CONNECTED`.
2. Open **Send a message** and enter the consenting recipient in international format.
3. Select **Check number** and continue only if the result says the number exists on WhatsApp.
4. Enter a message of 1 to 4,000 characters.
5. Confirm the recipient-consent checkbox, then send once.
6. Record the returned status and inspect **Message history** for later status events.

The web client creates a UUID idempotency key for the submission. The API also checks the number again immediately before sending. `ACCEPTED` means the Baileys send call returned a WhatsApp message ID; it does not prove delivery or receipt.

### From the API

The commands below read credentials and recipient data interactively so no credentials or real phone numbers are embedded in this README. They assume the default API URL and an existing connected instance.

Log in and extract the CSRF token while keeping the session cookie in `/tmp`:

```sh
printf 'Administrator email: '
IFS= read -r ADMIN_EMAIL
printf 'Administrator password: '
IFS= read -rs ADMIN_PASSWORD
printf '\n'
LOGIN_BODY="$(node -e 'process.stdout.write(JSON.stringify({email: process.argv[1], password: process.argv[2]}))' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
LOGIN_RESPONSE="$(curl --fail-with-body --silent --show-error --cookie-jar /tmp/wa-api-cookies.txt --header 'content-type: application/json' --data "$LOGIN_BODY" http://localhost:3000/api/v1/auth/login)"
CSRF_TOKEN="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).data.csrfToken)' "$LOGIN_RESPONSE")"
unset ADMIN_PASSWORD LOGIN_BODY
```

Read the instance and consenting recipient, then perform the required number check:

```sh
printf 'Connected instance ID: '
IFS= read -r INSTANCE_ID
printf 'Consenting recipient in international + format: '
IFS= read -r TEST_RECIPIENT
CHECK_BODY="$(node -e 'process.stdout.write(JSON.stringify({phoneNumber: process.argv[1]}))' "$TEST_RECIPIENT")"
curl --fail-with-body --silent --show-error --cookie /tmp/wa-api-cookies.txt --header 'content-type: application/json' --header "x-csrf-token: $CSRF_TOKEN" --data "$CHECK_BODY" "http://localhost:3000/api/v1/whatsapp/instances/$INSTANCE_ID/check-number"
```

Continue only when the response has `"exists": true`. Confirm consent outside the software, generate one idempotency key, and send one message:

```sh
printf 'Consented test message: '
IFS= read -r TEST_MESSAGE
IDEMPOTENCY_KEY="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
SEND_BODY="$(node -e 'process.stdout.write(JSON.stringify({phoneNumber: process.argv[1], message: process.argv[2], recipientConsentConfirmed: true}))' "$TEST_RECIPIENT" "$TEST_MESSAGE")"
curl --fail-with-body --silent --show-error --cookie /tmp/wa-api-cookies.txt --header 'content-type: application/json' --header "x-csrf-token: $CSRF_TOKEN" --header "idempotency-key: $IDEMPOTENCY_KEY" --data "$SEND_BODY" "http://localhost:3000/api/v1/whatsapp/instances/$INSTANCE_ID/messages/text"
```

If the HTTP response is lost, reuse the same `IDEMPOTENCY_KEY` and `SEND_BODY` in the same shell rather than generating a new key. A duplicate successful lookup returns the stored record with `duplicate: true` and does not call the provider again. Reuse protection is scoped to administrator, instance, and key, and expires according to `IDEMPOTENCY_RETENTION_HOURS`.

Clean up the temporary browser-equivalent session material when finished:

```sh
rm -f /tmp/wa-api-cookies.txt
unset ADMIN_EMAIL LOGIN_RESPONSE CSRF_TOKEN INSTANCE_ID TEST_RECIPIENT TEST_MESSAGE CHECK_BODY SEND_BODY IDEMPOTENCY_KEY
```

## API Overview

All `/api/` responses use a JSON envelope with a request ID. Health endpoints are intentionally not enveloped. All mutation endpoints accept `application/json` only. Except for login, authenticated mutations require both the session cookie and the `x-csrf-token` header.

| Method | Path | Purpose | Protection |
| --- | --- | --- | --- |
| `GET` | `/health/live` | Process liveness | Public |
| `GET` | `/health/ready` | Database/config readiness and instance runtime status | Public |
| `POST` | `/api/v1/auth/login` | Create a 12-hour administrator session | Login rate limit |
| `GET` | `/api/v1/auth/me` | Read current administrator | Session |
| `POST` | `/api/v1/auth/logout` | Delete current session and clear cookies | Session and CSRF |
| `GET` | `/api/v1/whatsapp/instances` | List instances | Session |
| `POST` | `/api/v1/whatsapp/instances` | Create an instance | Session and CSRF |
| `GET` | `/api/v1/whatsapp/instances/:instanceId` | Read an instance | Session |
| `POST` | `/api/v1/whatsapp/instances/:instanceId/connect` | Open or resume a provider connection | Session and CSRF |
| `POST` | `/api/v1/whatsapp/instances/:instanceId/disconnect` | Stop socket but retain auth | Session and CSRF |
| `POST` | `/api/v1/whatsapp/instances/:instanceId/logout` | Log out and delete auth | Session and CSRF |
| `DELETE` | `/api/v1/whatsapp/instances/:instanceId` | Delete a stopped instance; auth and messages cascade | Session and CSRF |
| `POST` | `/api/v1/whatsapp/instances/:instanceId/check-number` | Normalize and query an individual number | Session, CSRF, and rate limit |
| `POST` | `/api/v1/whatsapp/instances/:instanceId/messages/text` | Validate, recheck, and send consented text | Session, CSRF, rate limit, and idempotency |
| `GET` | `/api/v1/whatsapp/instances/:instanceId/messages` | Paginated history with optional status | Session |
| `GET` | `/api/v1/whatsapp/instances/:instanceId/messages/:messageId` | Read one stored message summary | Session |

History accepts `page` from 1, `limit` from 1 to 100, and an optional `status` of `QUEUED`, `ACCEPTED`, `SENT`, `DELIVERED`, `READ`, or `FAILED`.

Deleting an instance requires database status `DISCONNECTED`, `LOGGED_OUT`, or `ERROR` and no active socket. Its auth and message rows cascade; standalone audit rows naming the instance are retained.

### Expected responses

The IDs and timestamps below are synthetic examples, not credentials or evidence of a real send.

A normal API success envelope, shown for a connection request:

```json
{
  "success": true,
  "data": {
    "instanceId": "default",
    "status": "CONNECTING"
  },
  "requestId": "2659ad20-38a3-4a75-b745-5f1a74311313"
}
```

A successful number check:

```json
{
  "success": true,
  "data": {
    "input": "+15551234567",
    "normalizedNumber": "15551234567",
    "exists": true,
    "jid": "15551234567@s.whatsapp.net"
  },
  "requestId": "105364ad-88b7-44c7-bac2-750b914c6630"
}
```

An unavailable number is a successful check with `exists: false`, not proof that another formatting variant should be tried:

```json
{
  "success": true,
  "data": {
    "input": "+15551234567",
    "normalizedNumber": "15551234567",
    "exists": false,
    "reason": "The number is not available on WhatsApp."
  },
  "requestId": "ab3f6e99-908a-483d-9850-dc4479fd846c"
}
```

A send accepted by the provider:

```json
{
  "success": true,
  "data": {
    "success": true,
    "messageId": "3EB0A417D5B2458C6D7A",
    "status": "ACCEPTED",
    "recipient": "15551234567",
    "createdAt": "2026-07-18T12:00:00.000Z",
    "recordId": "f0226f79-37e1-44ea-85a2-84c21ddb8448",
    "duplicate": false
  },
  "requestId": "685cd88c-6a90-4333-a942-b50e8cd9c6db"
}
```

`ACCEPTED` is not `SENT`, `DELIVERED`, or `READ`. It must never be presented as proof of actual delivery. Later statuses depend on best-effort Baileys receipt events and may remain incomplete.

All API errors use this shape. For example, a send to a number that fails the server-side availability recheck returns HTTP 422:

```json
{
  "success": false,
  "error": {
    "code": "NUMBER_NOT_ON_WHATSAPP",
    "message": "The recipient is not available on WhatsApp."
  },
  "requestId": "fa196f2a-3f9f-4962-b6d4-b65082737c0f"
}
```

Rate-limit responses use HTTP 429 and include `Retry-After`. Unexpected internal errors expose only `INTERNAL_ERROR` and a generic message; details remain in redacted server logs.

Liveness returns HTTP 200:

```json
{
  "status": "alive"
}
```

Readiness with a connected database returns HTTP 200:

```json
{
  "status": "ready",
  "database": "connected",
  "configuration": "valid",
  "whatsapp": {
    "default": "CONNECTED"
  }
}
```

If the database query fails, readiness returns HTTP 503:

```json
{
  "status": "not_ready",
  "database": "unavailable",
  "configuration": "valid",
  "whatsapp": {}
}
```

## WebSocket Events

Socket.IO is served from the API origin. The handshake must include a valid `wa_admin_session` cookie and must originate from `APP_URL`. After connecting, subscribe to an existing instance with the named Socket.IO event:

```js
socket.emit('whatsapp.subscribe', { instanceId: 'default' });
```

A successful subscription immediately emits current `whatsapp.status` and any unexpired QR snapshot.

Server events are:

| Event | Important fields |
| --- | --- |
| `whatsapp.status` | `instanceId`, lifecycle `status`, `timestamp` |
| `whatsapp.qr` | `instanceId`, `qrImageDataUrl`, `expiresAt` |
| `whatsapp.connected` | `instanceId`, `CONNECTED`, optional `connectedPhone`, `timestamp` |
| `whatsapp.disconnected` | `instanceId`, final `status`, `timestamp` |
| `whatsapp.error` | `instanceId`, safe `code`, safe `message`, `timestamp` |
| `message.status` | `instanceId`, `externalMessageId`, `SENT`, `DELIVERED`, `READ`, or `FAILED`, `timestamp` |

Events are process-local and routed to instance rooms. This is a single-tenant MVP: every authenticated active administrator can subscribe to every existing instance.

## Authentication Persistence

Baileys credentials and Signal keys are persisted in PostgreSQL table `WhatsAppAuthState`; they are not written to `sessions/`, `auth_info_baileys/`, `.baileys/`, or any other filesystem location. There is no filesystem fallback.

Each `creds` or Signal-key value is independently:

1. Serialized as JSON with Baileys `BufferJSON.replacer` so buffers and typed values survive persistence.
2. Encrypted with AES-256-GCM using `SESSION_ENCRYPTION_KEY`, a new random 12-byte IV, and a per-record authentication tag.
3. Stored as `encryptedPayload`, `iv`, `authTag`, and `encryptionVersion` in PostgreSQL.
4. Decrypted and parsed with `BufferJSON.reviver` on use. Baileys app-state sync keys are additionally reconstructed as protobuf objects for `7.0.0-rc13`.

Tampered ciphertext or the wrong key fails authenticated decryption. Keeping only the PostgreSQL volume is not enough to resume sessions: the exact matching encryption key is also required. Changing `SESSION_ENCRYPTION_KEY` has no automatic rotation path and makes existing auth state, plus any encrypted full message text, unreadable.

On API startup, previously active instances with stored auth records are automatically offered for reconnection. Instances explicitly left `DISCONNECTED` or `LOGGED_OUT` stay stopped. A normal disconnect preserves auth for a later manual reconnect. Explicit logout, an invalid/bad session, a multi-device mismatch, or instance deletion removes auth rows.

## Security Controls

- Administrator passwords use Argon2id. The seed uses memory cost 19,456 KiB, time cost 2, and parallelism 1.
- Login creates independent random 32-byte session and CSRF tokens. Only HMAC-SHA-256 hashes are stored in PostgreSQL.
- Sessions last 12 hours. The session cookie is `HttpOnly`; both cookies use `SameSite=Lax` and become `Secure` when `NODE_ENV=production`.
- Browser credentials are sent with `credentials: include`; authentication material is not stored in browser local storage.
- Authenticated mutations require the matching `x-csrf-token` and JSON content type.
- Credentialed CORS accepts only the exact `APP_URL` origin. Socket.IO uses the same origin restriction.
- Fastify Helmet sets restrictive API security headers, including no framing and no referrer. Nginx sets equivalent static-site headers.
- API response caching is disabled. Request bodies are limited to 64 KiB; Socket.IO messages are limited to 250,000 bytes.
- Phone inputs require international `+` format and normalize to 8 to 15 digits. Only individual `@s.whatsapp.net` recipients are allowed.
- Text is trimmed, limited to 4,000 characters, rejects unsafe control characters and HTML-only content, and requires `recipientConsentConfirmed: true`.
- The server checks number availability again during every send, regardless of any browser-side check.
- Sends are serialized by an in-memory mutex per instance and protected by a unique administrator/instance/idempotency-key database constraint.
- Default in-memory limits are 5 sends per instance per minute, 10 number checks per administrator per minute, and 5 failed logins per IP per 15 minutes.
- Pino redacts cookies, authorization, passwords, message text, QR data, encrypted payloads, and encryption keys. Phone numbers are masked in provider logs.
- Audit records cover login outcomes, instance creation/deletion, QR requests, connection lifecycle, number checks, and send outcomes without intentional message content storage in audit metadata.
- Optional full message text uses the same AES-256-GCM service and is disabled by default.

These controls do not replace TLS, network isolation, a secrets manager, database access control, monitoring, host hardening, or an organizational messaging policy.

## Data Retention

The retention task runs once at API startup and then every 24 hours:

- A 100-character normalized text preview is stored for every message, even when `STORE_FULL_MESSAGE_TEXT=false`.
- Full text is stored only when `STORE_FULL_MESSAGE_TEXT=true`, and then only as an encrypted packed AES-256-GCM envelope.
- After `MESSAGE_RETENTION_DAYS`, both preview and encrypted full text are set to `null`.
- Message routing metadata, recipient number/JID, status, timestamps, errors, consent flag, and the message row are not automatically deleted.
- After `IDEMPOTENCY_RETENTION_HOURS`, the stored key is replaced with an internal expired value. Reusing the old caller key can then create a new send.
- Expired administrator sessions are deleted during retention cleanup.
- Audit logs have no automatic retention or deletion job.
- WhatsApp auth records remain until explicit logout, invalid-session handling, or instance deletion.
- Administrators and instances have no time-based deletion job.

Set retention values according to a documented legal and operational policy. If recipient metadata, audit logs, message records, or administrators must be deleted, add and test an explicit administrative process; the current timer only clears message content and expired session/idempotency material.

## Backups and Recovery

Treat the database backup and encryption-key backup as two separate protected assets.

Create a logical backup of the Compose database with:

```sh
docker compose exec -T postgres pg_dump -U postgres -d whatsapp_connector -Fc > whatsapp_connector.dump
```

Also take tested, encrypted, access-controlled backups according to the PostgreSQL recovery objectives, and consider provider-managed snapshots and point-in-time recovery in production. A raw named-volume copy should be taken only with PostgreSQL stopped or with a storage snapshot method that guarantees database consistency.

Back up the exact `SESSION_ENCRYPTION_KEY` separately in a secrets manager or encrypted recovery vault. Do not commit it, put it in the database dump, or store it beside the dump under the same access control. A database backup without its matching encryption key cannot recover linked sessions or encrypted message text. An encryption key without the corresponding database backup has no auth records to decrypt. Track which separately stored key version belongs to each backup and test restoration in an isolated environment.

`SESSION_SECRET` may also be retained if preserving active web sessions is required. Rotating or losing it invalidates practical use of existing session-token hashes but does not affect WhatsApp auth decryption; administrators can log in again after rotation.

## Tests and Verification

Run the automated checks from the root:

```sh
npm test
npm run typecheck
npm run build
```

API tests cover phone normalization and masking, text and consent validation, AES-GCM tamper detection, redaction, lifecycle transitions, reconnect delays, authentication, CSRF-backed routes, rate limiting, disconnected sends, idempotency, and history pagination. The API integration suite uses an in-memory fake Prisma client and mock WhatsApp provider. The web test command currently passes with no test files. There is no automated live-WhatsApp, real-Baileys, real-PostgreSQL, browser, or delivery end-to-end test.

### Manual test checklist

- Start with a fresh non-production database and unique secrets; verify invalid encryption-key configuration prevents API startup.
- Verify `/health/live` is 200 and `/health/ready` reports the database connected.
- Verify a valid admin login works, an invalid login is generic, and repeated failures return 429 with `Retry-After`.
- Create an instance, open its connect page, receive a QR only after authenticated Socket.IO subscription, and confirm it expires in about 60 seconds.
- Link through WhatsApp Linked Devices and confirm the exact sending account appears as `CONNECTED`.
- Restart the API without changing PostgreSQL data or `SESSION_ENCRYPTION_KEY`; confirm the session reconnects without a new QR.
- Verify local-format, alphabetic, too-short, and too-long recipient numbers are rejected.
- Check a consenting real test number and separately confirm an unavailable number is not sent to.
- Verify the UI cannot send until the instance is connected, the number is checked, text is valid, and consent is checked.
- Send once with a fixed idempotency key, repeat the same request, confirm `duplicate: true`, and confirm only one provider send occurred.
- Confirm `ACCEPTED` is displayed only as provider acceptance and that later receipt statuses are treated as best effort.
- Disconnect and reconnect while preserving auth, then log out and verify a fresh QR is required.
- Confirm logs and audits contain no raw password, cookie, QR, full message, encryption key, or unmasked provider recipient.
- Exercise backup restoration with the matching encryption key before relying on it operationally.

## Troubleshooting

Start with service state and logs:

```sh
docker compose ps
docker compose logs api
docker compose logs postgres
```

### QR missing or expired

- The QR is available only through authenticated Socket.IO, not a REST URL. Confirm the console shows the live channel online and that login cookies are accepted by the API origin.
- `APP_URL` must exactly match the browser origin. In Compose, `API_URL` must point the built web app at the browser-reachable API origin; `VITE_API_URL` controls local Vite.
- A QR is retained for 60 seconds. Scan it promptly. If it expires and no replacement arrives, use **Disconnect**, then **Connect** to force a new socket and QR, and inspect API logs for provider errors.
- Confirm the instance exists and that the browser subscribed using the same lowercase instance ID.

### Connection closes immediately

- Inspect `lastErrorCode`, `lastErrorMessage`, and API logs. A replaced or forbidden connection enters `ERROR`; invalid, bad, or multi-device-mismatch sessions enter `LOGGED_OUT` and their auth rows are removed.
- Check host/container time, DNS, outbound HTTPS/WebSocket access, and interference from proxies or firewalls.
- Check WhatsApp Linked Devices for another client replacing this one. If the stored session is stale, explicitly log it out and pair again instead of repeatedly reconnecting.

### Instance is `LOGGED_OUT`

`LOGGED_OUT` means the linked session is no longer usable. Stored auth has been deleted. Select **Connect** and complete Linked Devices pairing again. If appropriate, remove the stale device entry from the phone as well.

### Session is missing after restart

- Verify the same PostgreSQL database and `postgres_data` volume are mounted and that `WhatsAppAuthState` records were not deleted.
- Verify the exact original `SESSION_ENCRYPTION_KEY` is present. A new key cannot decrypt old records.
- Do not look for a session directory: there is no filesystem persistence fallback.
- Explicit logout and invalid-session handling intentionally delete auth. A normal disconnect does not.

### Recipient number is unavailable

- Use international format beginning with `+` and country code; local numbers are rejected.
- Only individual WhatsApp recipients are supported. Groups, broadcast lists, and unsupported JID types are rejected.
- If a check returns `exists: false`, do not send. Confirm the number with the consenting recipient rather than guessing variants.
- A `NUMBER_CHECK_FAILED` 503 is transient provider failure, not proof that the number exists or does not exist.

### Send times out

The provider timeout is 30 seconds. The message record becomes `FAILED` with `MESSAGE_SEND_TIMEOUT`, and repeating the same idempotency key returns the stored failure. A timeout does not provide definitive delivery information because the remote operation cannot be canceled reliably. Do not immediately retry with a new key: inspect the WhatsApp account and history first, because a new key could create a duplicate send. If a deliberate retry is approved, use a new key only after resolving that ambiguity.

### Docker volume permissions

- The supplied Compose file uses a Docker-managed named volume, not a host bind mount. Inspect `docker compose logs postgres` and Docker's volume ownership before changing permissions.
- `docker compose down` preserves the volume. `docker compose down -v` permanently deletes the local database and all auth/message data; use it only for an explicitly disposable environment.
- Do not add an API session-directory mount. Auth belongs in PostgreSQL and the API runtime runs as the unprivileged `node` user.

### Database unavailable

- Readiness returns 503 when `SELECT 1` fails. Check the PostgreSQL health check and API `DATABASE_URL`.
- Use hostname `postgres` from the Compose API container. Use a host-reachable hostname such as `localhost` only when running the API directly on the host and PostgreSQL is actually listening there.
- Confirm database name, role, password, network policy, TLS requirements, and migration state. The Compose PostgreSQL port is not published to the host.
- The API cannot initialize persisted WhatsApp sessions without PostgreSQL; restore database availability before trying to reconnect.

### Baileys or WhatsApp breaking changes

- Confirm installation used `npm ci` and that `@whiskeysockets/baileys` remains exactly `7.0.0-rc13` in both package and lock files.
- A pinned client cannot prevent server-side WhatsApp protocol changes. Pairing or sends can break without a repository change.
- Do not upgrade Baileys as a blind troubleshooting step. Review its release and migration notes, adapter imports, `BufferJSON` behavior, protobuf reconstruction, disconnect reasons, receipt mappings, and socket options.
- Run unit, type, build, real PostgreSQL, manual QR, reconnect, number-check, consent, idempotency, and receipt tests before deployment. Keep a rollback artifact, while recognizing that a protocol change can also make the old artifact unusable.

## Production Limitations

- This is an unofficial linked-device integration, not the supported Meta WhatsApp Business Platform. Account restrictions, disconnects, and incompatible WhatsApp changes remain possible.
- The API owns sockets, QR snapshots, reconnect timers, event dispatch, per-instance mutexes, and all rate-limit windows in memory on one server.
- Running replicas as-is can create competing sockets, bypass per-process rate limits, lose events between replicas, and defeat per-instance serialization. Replicas require distributed connection ownership and locks, a shared rate limiter, cross-node pub/sub, coordinated reconnects, and an intentional Socket.IO routing strategy.
- Idempotency is database-backed, but an omitted key is generated by the server. Callers that may retry must provide and retain their own key.
- A timed-out provider call is not canceled. Outcome reconciliation and retry policy need additional work for stronger delivery guarantees.
- Baileys receipt events are best effort. `ACCEPTED` is not delivery, and `SENT`, `DELIVERED`, or `READ` may be delayed, absent, or affected by recipient privacy and protocol behavior.
- There is no inbound-message processing, media, templates, groups, campaigns, bulk sending, webhook API, scheduled sending, or queue worker.
- All active administrators share the same tenant and can access all instances and message history. There is no per-instance role or tenant authorization.
- Rate limiting is fixed-window and in-memory. It resets on restart and does not coordinate replicas.
- `trustProxy` is disabled. Deploying behind a proxy requires a reviewed code/configuration change before source-IP-based login limits and audit IPs can be trusted.
- The supplied Nginx and Compose setup provides no TLS, secret manager, production database credentials, ingress policy, monitoring, alerting, or high availability.
- Administrator password rotation, encryption-key rotation, audit retention, and recipient-data deletion are operational gaps that need explicit procedures or product work.
- Automated tests mock both Prisma and WhatsApp behavior; live compatibility must be validated manually in an isolated, consent-based environment.

Before production use, add TLS, managed secrets, a least-privilege managed database, encrypted backups, monitoring, alerting, dependency review, tested incident recovery, and an approved messaging/consent policy. Do not expose the API or web console directly to the public internet without an additional access-control boundary.

## Migration to Meta Cloud API

The provider boundary makes a staged migration possible, but no Meta Cloud API provider exists in this repository today.

1. Implement an official provider behind `WhatsAppProvider` in `apps/api/src/modules/whatsapp/whatsapp.types.ts`, or split the interface into messaging and connection-capability interfaces where QR operations do not apply.
2. Inject the chosen provider in `buildApp` instead of constructing `BaileysWhatsAppProvider` directly. Add an instance provider type so Baileys and Meta-backed instances can coexist during migration.
3. Replace encrypted Baileys credential records with references to Meta system-user tokens, business account IDs, and phone-number IDs held in a secrets manager. Do not store long-lived Meta tokens as plaintext application rows.
4. Add Meta webhook endpoints with signature verification, replay protection, durable event ingestion, and mapping from Meta message IDs/statuses into the existing message status model.
5. Preserve the current consent validation, number normalization policy where applicable, audit records, message records, rate controls, and database idempotency contract.
6. Replace the Linked Devices QR UI with Meta's supported onboarding or an operator-managed account configuration flow.
7. Run providers in parallel for selected instances, reconcile status semantics, verify templates and conversation-policy requirements, then retire Baileys auth rows and QR routes after cutover.

The migration should treat Meta's acceptance response as acceptance, not delivery, and continue to derive delivery/read state only from verified provider callbacks. Moving to the official API changes transport and account management; it does not remove the need for consent, anti-spam controls, idempotency, retention, or operational reconciliation.
