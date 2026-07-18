# Security Policy

## Supported Version

Security fixes are applied to the latest code on the default branch. This MVP
does not currently maintain multiple supported release lines.

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities, leaked credentials, QR values, or
WhatsApp authentication material in a public issue, discussion, pull request,
or log attachment.

Use the repository's **Security** tab to open a private GitHub security
advisory. Include:

- A concise description and affected component.
- Reproduction steps using synthetic data.
- The potential impact.
- Any suggested mitigation.

Do not include real phone numbers, message contents, session records, access
tokens, cookies, encryption keys, or live QR codes. Maintainers should revoke
or rotate any secret that may have been exposed before investigating further.

## Unofficial Provider Risk

Baileys uses WhatsApp's linked-device protocol and is not the official Meta
WhatsApp Business Platform. A disconnection or upstream protocol change is not
necessarily a security vulnerability in this repository. Reports involving
credential exposure, cross-instance QR access, authorization bypass, unsafe
recipient handling, or encryption failures are security issues and should be
reported privately.

## Public Repository Hygiene

Before opening an issue or pull request:

- Never commit `.env` files or Docker volume contents.
- Never commit Baileys auth/session directories.
- Use only synthetic phone numbers and message content in tests.
- Sanitize logs and screenshots.
- Run `npm audit`, `npm run typecheck`, `npm test`, and `npm run build`.
