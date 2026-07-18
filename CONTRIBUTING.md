# Contributing

Contributions that improve safe, consent-based, one-to-one messaging are
welcome. Features for spam, scraping, bulk enumeration, restriction evasion,
proxy rotation, or unsolicited campaigns are out of scope.

## Development Setup

1. Install Node.js 20.19 or later and npm 10 or later.
2. Create a local `.env` from `.env.example` and replace every example secret.
3. Run `npm ci`.
4. Run `npm run db:generate`.
5. Start PostgreSQL and apply the migration, or use Docker Compose.

See `README.md` for the quick setup and `docs/OPERATIONS.md` for the complete technical and Docker guidance.

## Pull Requests

- Keep Baileys-specific imports inside the Baileys provider module.
- Confirm changes against the exact installed Baileys version.
- Preserve consent, validation, rate limiting, idempotency, and tenant-safe
  realtime boundaries.
- Add tests without connecting to a real WhatsApp account.
- Do not include credentials, real phone numbers, complete messages, QR data,
  session state, database dumps, or screenshots containing private data.
- Update documentation for configuration or operational changes.

Run before submitting:

```sh
npm run db:generate
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

## Dependency Changes

Baileys is intentionally pinned because its API and WhatsApp protocol behavior
can change between releases. A Baileys upgrade must include a review of its
exports, auth serialization, key-store contract, events, disconnect reasons,
number lookup, message formats, and receipt mappings.

## Security Reports

Follow `SECURITY.md`. Do not report vulnerabilities or leaked secrets in a
public issue.
