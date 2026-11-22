# Security Policy

Do not publish API bearer tokens, tenant identifiers, real call recording files, or webhook secrets in issues or commits.

**Use this SDK on trusted Node.js servers only.** Do not ship secrets in browser bundles or mobile apps.

The receiver for inbound webhooks fails closed until an authenticated, replay-protected verification contract is supplied by the integrator. The SDK never invents an undocumented signature scheme.

To report a security vulnerability privately, use GitHub's private vulnerability reporting for this repository when enabled, rather than opening a public issue. Never include live tokens or customer personal data in reports.
