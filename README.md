# WhatsApp Connector

WhatsApp Connector is a self-hosted MVP for linking an existing WhatsApp account through WhatsApp's Multi-Device QR mechanism. An authenticated administrator can connect an account, verify one consenting recipient, send a text message, and review message status history.

It uses Node.js, TypeScript, Fastify, React, PostgreSQL, Prisma, Socket.IO, and `@whiskeysockets/baileys`.

## Important Warning

> This connection uses WhatsApp’s linked-device mechanism and is not the official Meta WhatsApp Business Platform. Sessions may disconnect, WhatsApp changes may affect functionality, and improper automated messaging may cause account restrictions.

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by WhatsApp LLC or Meta Platforms, Inc. Use it only with accounts you control and recipients who explicitly consented to receive the message. A dedicated test account is preferable to a primary personal or business account.

The MVP supports individual outbound text messages only. It does not provide campaigns, bulk sending, scraping, contact discovery, groups, media, chatbots, restriction evasion, or the Meta Cloud API.

## What It Provides

- Secure administrator login.
- QR linking through WhatsApp Linked Devices.
- Encrypted PostgreSQL persistence of Baileys authentication state.
- Automatic recovery of previously active sessions after restart.
- Live QR and connection status updates.
- International phone-number validation and one-number WhatsApp lookup.
- Consent confirmation and idempotent text sending.
- Conservative rate limits and safe message history.
- Docker Compose setup for the API, web application, and PostgreSQL.

## Prerequisites

- Node.js 20.19 or later.
- npm 10 or later.
- Docker with Docker Compose v2.
- An authorized WhatsApp account with access to Linked Devices.
- Free local ports `3000` and `5173`, or alternative ports configured in `.env`.

## Quick Setup

Run these commands from the cloned repository root:

```sh
npm run setup:env
docker compose up --build
```

`npm run setup:env` creates an ignored `.env` containing random local secrets. It refuses to overwrite an existing file and prints the generated administrator password once. The administrator email is:

```text
admin@example.com
```

When all containers are healthy, open:

- Web interface: `http://localhost:5173`
- API: `http://localhost:3000`
- Liveness: `http://localhost:3000/health/live`
- Readiness: `http://localhost:3000/health/ready`

## First Connection Test

1. Log in with `admin@example.com` and the generated password.
2. Create the suggested `default` instance.
3. Select **Connect**.
4. On the authorized phone, open WhatsApp.
5. Open **Linked Devices** and select **Link a Device**.
6. Scan the QR shown by the application.
7. Wait for the status to become `CONNECTED`.
8. Open **Send a message**.
9. Enter one consenting recipient in international `+` format and select **Check number**.
10. Enter a test message, confirm consent, and send it once.

`ACCEPTED` means the provider accepted the send request. It does not prove that the message was delivered or read.

## Port Changes

If ports `3000` or `5173` are occupied, update these related values together in `.env` before building:

```env
API_PORT=3300
WEB_PORT=5517
APP_URL=http://localhost:5517
API_URL=http://localhost:3300
API_WS_URL=ws://localhost:3300
VITE_API_URL=http://localhost:3300
```

Then open `http://localhost:5517`.

## Manual Environment Setup

Instead of the setup command, create `.env` manually:

```sh
cp .env.example .env
```

Replace `ADMIN_PASSWORD` and `SESSION_SECRET` with strong values. Generate the required 32-byte encryption key with:

```sh
openssl rand -base64 32
```

Set its output as `SESSION_ENCRYPTION_KEY`. Never commit `.env` or WhatsApp session material.

## Local Development

For development outside the application containers, configure `DATABASE_URL` for a PostgreSQL server reachable from the host, then run:

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

## Automated Tests

Automated tests use a mock WhatsApp provider and do not connect to a real account:

```sh
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
```

QR linking and actual sending require a manual test with an authorized account and consenting recipient.

## Stopping the Application

Stop containers while preserving PostgreSQL data:

```sh
docker compose down
```

To start them again:

```sh
docker compose up --build
```

## More Documentation

- [Technical and operations guide](docs/OPERATIONS.md)
- [Security policy](SECURITY.md)
- [Contributing guide](CONTRIBUTING.md)
- [MIT License](LICENSE)
