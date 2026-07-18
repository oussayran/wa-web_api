## Summary

Describe the behavior changed and why.

## Verification

- [ ] `npm run db:generate`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm audit --audit-level=high`

## Security and Privacy

- [ ] No `.env`, credentials, tokens, encryption keys, cookies, or auth state.
- [ ] No real phone numbers, complete messages, QR data, or private screenshots.
- [ ] Consent, idempotency, rate limits, and recipient restrictions remain enforced.
- [ ] Baileys changes were checked against the exact installed version.

## Database and Operations

- [ ] Schema changes include a migration.
- [ ] New environment variables are documented in `.env.example` and `README.md`.
- [ ] Rollback and session-persistence effects are described when applicable.
