# Voipano — Official Node.js SDK

[![Tests](https://github.com/voipano/node-voipano/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/voipano/node-voipano/actions/workflows/tests.yml)
[![npm version](https://img.shields.io/npm/v/voipano)](https://www.npmjs.com/package/voipano)
[![License](https://img.shields.io/github/license/voipano/node-voipano)](LICENSE)
[![Documentation](https://img.shields.io/badge/docs-EN%20%7C%20FA-blue)](README.md)

Official, typed, dependency-free **Node.js** SDK for the Voipano Public API v1.

[وب‌سرویس ویپانو — راهنمای فارسی](README.fa.md) · [API collection](docs/voipano-webservice.postman_collection.json)

> **Server-side only.** Never expose your Voipano Bearer API token in a browser, mobile application bundle, or public frontend code. Use the SDK in Node.js backends.

## Requirements

- Node.js **22+** (supported LTS majors: 22, 24, 26 as of November 2026)
- No runtime dependencies
- Supports both ECMAScript modules (ESM) and CommonJS (CJS)
- Bundled TypeScript declarations

## Installation

```bash
npm install voipano
```

## Quick start

Set `VOIPANO_API_TOKEN` in your **server-side** environment, optionally set `VOIPANO_SERVICE_ID` for a service-scoped token:

```js
import { VoipanoClient } from 'voipano';

const voipano = new VoipanoClient(); // reads process.env.VOIPANO_API_TOKEN
const services = await voipano.services.all();
const contacts = await voipano.contacts.all({ page: 1, per_page: 20 });
console.log(services, contacts);
```

Or pass explicit configuration:

```js
const client = new VoipanoClient({
  token: process.env.VOIPANO_API_TOKEN,
  serviceId: process.env.VOIPANO_SERVICE_ID,
  timeoutMs: 30000,
});
```

CommonJS:

```js
const { VoipanoClient } = require('voipano');
```

## API resources

| Resource | Methods | API endpoint(s) |
| --- | --- | --- |
| `client.services` | `all()` | `GET /services` |
| `client.contacts` | `all(filters)`, `find(id)`, `create(data)`, `update(id, data)`, `updatePut(id, data)`, `delete(id)`, `bulkImport(contacts, options)` | `/contacts`, `/contacts/bulk-import` |
| `client.contactGroups` | `all(filters)`, `create(data)`, `delete(id)` | `/contact-groups` |
| `client.musicOnHolds` | `all(filters)` | `/music-on-holds` |
| `client.callReports` | `all(filters)` | `/call-reports` |
| `client.voicemailInboxes` | `all(filters)` | `/voicemail-inboxes` |
| `client.recordings` | `call(cdrId, recordId, query)`, `voicemail(id, context, mailbox, query)`, `downloadCall(cdrId, recordId, destination, query)`, `downloadVoicemail(id, context, mailbox, destination, query)` | `/call-recordings/:id`, `/voicemail-recordings/:id` |
| `client.webhooks` | `get()`, `configure(settings)`, `route(event, settings)`, `configureLegacy(settings)` | `/call-events-webhook` |
| `client.calls` | `otp(phoneNumber, options)`, `clickToCall(source, destination, options)`, `secureCall(source, destination, options)` | `/call-otp`, `/click-to-call`, `/secure-call` |

Every public request from the supplied 2026-11-21 Postman collection is represented, including PATCH and PUT and the legacy POST webhook alias. These methods send **real operations**, including outbound calls and contact mutations.

### Calls and OTP

```js
// These operations can create REAL calls. Run only with explicit user intent.
await client.calls.otp('09120000000', { purpose: 'login', client_ref: 'otp-1001' });
await client.calls.clickToCall('09120000000', '09121111111', {
  timeout: 30, limit: 60, client_ref: 'click-1001'
});
await client.calls.secureCall('09120000000', '09121111111', {
  callback_url: 'https://example.com/webhooks/voipano/call',
  retry_count: 0,
  client_ref: 'secure-1001',
});
```

No HTTP requests are automatically retried, **including reads**. An unknown outcome on a write must be investigated, not blindly retried. `client_ref` is a tracking field, not documented as an idempotency guarantee.

### Scoped accounts and services

```js
const tenant = client.forService('your-service-id');
const tenantWithOwnToken = client.withToken('another-tenant-token');
const traced = tenant.withRequestId('your-request-id');
```

Cloning never mutates the original instance. Each request also gets an `X-Request-Id` header.

### Downloading recordings

```js
// cdrId (path) and callDetailsRecordId (query) must match the actual API contract.
const bytes = await client.recordings.call('cdr_123', 'cdr_detail_123');
await client.recordings.downloadCall('cdr_123', 'cdr_detail_123', './call.wav');
await client.recordings.downloadVoicemail('vm_123', 'default', '1001', './voicemail.wav');
```

Downloads refuse to overwrite existing files and remove partial files on failures. Binary endpoints reject JSON/HTML responses.

The Postman collection describes `call_details_record_id` as the same record identifier as the path parameter, but uses different sample values. Confirm the correct pairing with the live API before use.

### Incoming webhooks (fail closed)

The collection does **not** document signature headers, hashing algorithm, timestamp window, or replay protection. **No signing scheme is invented here.** The receiver rejects requests by default. Configure an authenticated verifier only after confirming the real Voipano webhook protocol:

```js
import { WebhookReceiver } from 'voipano';

const receiver = new WebhookReceiver({
  verify: async (rawBody, headers) => {
    // Implement ONLY the actual Voipano signature/timestamp/replay contract.
    return false;
  },
});

// Pass the raw request bytes, not a reserialized JSON object.
// await receiver.receive(rawBody, headers)
```

### Error handling

```js
import { AuthenticationError, RateLimitError, TransportError } from 'voipano';
try {
  await client.services.all();
} catch (e) {
  if (e instanceof AuthenticationError) console.error('Check API token');
  else if (e instanceof RateLimitError) console.error('API rate-limited');
  else if (e instanceof TransportError) console.error('Network error');
  else throw e;
}
```

Dedicated errors: `ApiError`, `AuthenticationError`, `PermissionError`, `NotFoundError`, `ValidationError`, `RateLimitError`, `ServerError`, `TransportError`, `UnexpectedResponseError`, `WebhookVerificationError`.

## Testing and release

```bash
npm ci
npm test
npm pack --dry-run
```

GitHub Actions tests Node.js 22, 24, and 26. The publish workflow runs on pushes to main or manual dispatch. It uses semantic-release to determine whether a new version is warranted from commit messages. Qualifying releases create a version tag and publish to npm using Trusted Publishing (OIDC).

The package is already published on npm. Do not manually create or move release tags, or republish existing versions. See [release configuration](release.config.mjs).

## Notes and limitations

- An API token, real backend and known-good response fixtures are needed for a **live API contract test**. This package's offline tests do not prove production API behavior.
- API JSON responses are intentionally left as open-shaped objects because the provided collection contains no response examples.
- All URLs use the official default `https://voipano.com/api/v1/webservice` unless configured otherwise.
- No automatic redirects or retries; avoid untrusted override base URLs and protect all secrets.

MIT License. See [SECURITY.md](SECURITY.md) for responsible disclosure.
