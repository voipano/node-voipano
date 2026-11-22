import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  VoipanoClient, WebhookReceiver, DEFAULT_BASE_URL, ApiError,
  AuthenticationError, PermissionError, NotFoundError, ValidationError,
  RateLimitError, ServerError, TransportError, UnexpectedResponseError,
  WebhookVerificationError,
} from '../src/index.mjs';

const require = createRequire(import.meta.url);
const cjs = require('../src/index.cjs');
const response = (data = { ok: true }, status = 200, headers = {}) => new Response(
  status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } },
);
const fake = (handler = () => response()) => {
  const requests = [];
  const client = new VoipanoClient({ token: 'example-test-token', fetch: async (url, options) => {
    const record = { url: new URL(url), ...options };
    requests.push(record);
    return handler(record);
  }});
  return { client, requests };
};

// Each documented Postman request, including verb aliases and event-specific routing.
const routes = [
  ['services.list', 'GET', '/services', c => c.services.all()],
  ['contacts.list', 'GET', '/contacts', c => c.contacts.all({ page: 1 })],
  ['contacts.find', 'GET', '/contacts/id', c => c.contacts.find('id')],
  ['contacts.create', 'POST', '/contacts', c => c.contacts.create({ primary_number: '09120000000' })],
  ['contacts.patch', 'PATCH', '/contacts/id', c => c.contacts.update('id', { first_name: 'A' })],
  ['contacts.put', 'PUT', '/contacts/id', c => c.contacts.updatePut('id', { first_name: 'A' })],
  ['contacts.delete', 'DELETE', '/contacts/id', c => c.contacts.delete('id')],
  ['contacts.bulk', 'POST', '/contacts/bulk-import', c => c.contacts.bulkImport([{ primary_number: '09120000000' }])],
  ['groups.list', 'GET', '/contact-groups', c => c.contactGroups.all()],
  ['groups.create', 'POST', '/contact-groups', c => c.contactGroups.create({ name: 'test' })],
  ['groups.delete', 'DELETE', '/contact-groups/id', c => c.contactGroups.delete('id')],
  ['moh.list', 'GET', '/music-on-holds', c => c.musicOnHolds.all()],
  ['reports.list', 'GET', '/call-reports', c => c.callReports.all()],
  ['voicemail.list', 'GET', '/voicemail-inboxes', c => c.voicemailInboxes.all()],
  ['call recording', 'GET', '/call-recordings/cdr', c => c.recordings.call('cdr', 'record')],
  ['voicemail recording', 'GET', '/voicemail-recordings/id', c => c.recordings.voicemail('id', 'default', '1001')],
  ['webhooks.get', 'GET', '/call-events-webhook', c => c.webhooks.get()],
  ['webhooks.configure', 'PUT', '/call-events-webhook', c => c.webhooks.configure({ is_active: true })],
  ['webhooks.route', 'PUT', '/call-events-webhook', c => c.webhooks.route('ringing', { is_active: true })],
  ['webhooks.legacy', 'POST', '/call-events-webhook', c => c.webhooks.configureLegacy({ is_active: true })],
  ['calls.otp', 'POST', '/call-otp', c => c.calls.otp('09120000000')],
  ['calls.clickToCall', 'POST', '/click-to-call', c => c.calls.clickToCall('a', 'b')],
  ['calls.secureCall', 'POST', '/secure-call', c => c.calls.secureCall('a', 'b')],
];
for (const [name, method, pathname, action] of routes) {
  test(`API contract ${name} ${method} ${pathname}`, async () => {
    const { client, requests } = fake(() => pathname.includes('recordings/') ?
      new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), { headers: { 'Content-Type': 'audio/wav' } }) : response());
    await action(client);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, method);
    assert.equal(requests[0].url.pathname, `/api/v1/webservice${pathname}`);
    assert.equal(requests[0].redirect, 'manual');
    assert.equal(requests[0].headers.Authorization, 'Bearer example-test-token');
    assert.ok(requests[0].headers['X-Request-Id']);
  });
}

test('default API path, env token and service ID', () => {
  const oldToken = process.env.VOIPANO_API_TOKEN;
  const oldService = process.env.VOIPANO_SERVICE_ID;
  try {
    process.env.VOIPANO_API_TOKEN = 'from-env';
    process.env.VOIPANO_SERVICE_ID = 'svc-1';
    const client = new VoipanoClient();
    assert.equal(client.token, 'from-env');
    assert.equal(client.serviceId, 'svc-1');
    assert.equal(client.baseUrl, DEFAULT_BASE_URL);
  } finally {
    if (oldToken === undefined) delete process.env.VOIPANO_API_TOKEN;
    else process.env.VOIPANO_API_TOKEN = oldToken;
    if (oldService === undefined) delete process.env.VOIPANO_SERVICE_ID;
    else process.env.VOIPANO_SERVICE_ID = oldService;
  }
});

test('ESM and CommonJS expose identical constructor', () => assert.equal(cjs.VoipanoClient, VoipanoClient));
test('stable package exports', () => assert.equal(typeof cjs.WebhookReceiver, 'function'));
test('scoped service and tokens do not mutate original', async () => {
  const { client, requests } = fake();
  const updated = client.forService('service-b').withToken('token-b').withRequestId('request-b');
  await updated.services.all();
  await client.services.all();
  assert.equal(requests[0].headers['X-Webservice-Service-Id'], 'service-b');
  assert.equal(requests[0].headers.Authorization, 'Bearer token-b');
  assert.equal(requests[0].headers['X-Request-Id'], 'request-b');
  assert.equal(requests[1].headers['X-Webservice-Service-Id'], undefined);
  assert.equal(requests[1].headers.Authorization, 'Bearer example-test-token');
});

test('query encoding, empty stripping and arrays', async () => {
  const { client, requests } = fake();
  await client.contacts.all({ search: 'تهران + 1', group_id: '', page: 2, tags: ['a', 'b'], omit: null });
  assert.equal(requests[0].url.searchParams.get('search'), 'تهران + 1');
  assert.equal(requests[0].url.searchParams.get('page'), '2');
  assert.equal(requests[0].url.searchParams.has('group_id'), false);
  assert.deepEqual(requests[0].url.searchParams.getAll('tags'), ['a', 'b']);
  assert.equal(requests[0].url.searchParams.has('omit'), false);
});

test('path IDs are encoded, including slash and Unicode', async () => {
  const { client, requests } = fake();
  await client.contacts.find('مخاطب/a');
  assert.ok(requests[0].url.toString().includes('%2Fa'));
  assert.equal(requests[0].url.pathname.includes('مخاطب'), false);
});

test('outgoing API headers contain JSON and request ID', async () => {
  const { client, requests } = fake();
  await client.calls.clickToCall('a', 'b', { timeout: 30, limit: 60 });
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.equal(requests[0].headers.Accept, 'application/json');
  assert.equal(JSON.parse(requests[0].body).call_source, 'a');
  assert.equal(JSON.parse(requests[0].body).call_destination, 'b');
  assert.equal(JSON.parse(requests[0].body).timeout, 30);
});

test('call recording uses explicit second ID in query', async () => {
  const { client, requests } = fake(() => new Response('abc', { headers: { 'Content-Type': 'audio/wav' } }));
  await client.recordings.call('cdr', 'detail', { client_ref: 'ref' });
  assert.equal(requests[0].url.searchParams.get('call_details_record_id'), 'detail');
  assert.equal(requests[0].url.searchParams.get('client_ref'), 'ref');
});

test('voicemail query retains context and mailbox', async () => {
  const { client, requests } = fake(() => new Response('abc', { headers: { 'Content-Type': 'audio/wav' } }));
  await client.recordings.voicemail('vm', 'default', '1001');
  assert.equal(requests[0].url.searchParams.get('context'), 'default');
  assert.equal(requests[0].url.searchParams.get('mailbox'), '1001');
});

test('webhook event is placed in JSON payload', async () => {
  const { client, requests } = fake();
  await client.webhooks.route('missed_call', { is_active: false });
  assert.deepEqual(JSON.parse(requests[0].body), { event: 'missed_call', is_active: false });
});

test('null or undefined options do not become JSON null', async () => {
  const { client, requests } = fake();
  await client.contacts.create();
  assert.equal(requests[0].body, '{}');
});

test('strict option validators protect misuse', async () => {
  const { client } = fake();
  assert.throws(() => client.contacts.find('../'), /Invalid|empty/u);
  assert.throws(() => client.contacts.find('..'), /Invalid/u);
  assert.throws(() => client.contacts.find(''), /empty/u);
  assert.throws(() => client.contacts.bulkImport([]), /1 to 3000/u);
  assert.throws(() => client.contacts.bulkImport(Array(3001).fill({})), /1 to 3000/u);
  assert.throws(() => client.contacts.bulkImport([null]), /1 to 3000/u);
  assert.throws(() => client.webhooks.route('other', {}), /Unsupported/u);
  assert.throws(() => client.calls.otp(''), /empty/u);
  assert.throws(() => client.calls.clickToCall('a', ''), /empty/u);
  assert.throws(() => client.calls.secureCall('', 'b'), /empty/u);
  assert.throws(() => client.recordings.call('cdr', ''), /empty/u);
  assert.throws(() => client.recordings.voicemail('vm', 'default', ''), /empty/u);
  await assert.rejects(client.request('POST', '//evil'), TypeError);
  await assert.rejects(client.request('GET', '/contacts?token=leak'), TypeError);
  await assert.rejects(client.request('TRACE', '/contacts'), TypeError);
});

test('reject bad token/service header values and URL override', () => {
  assert.throws(() => new VoipanoClient({ token: 'token\nheader' }), TypeError);
  assert.throws(() => new VoipanoClient({ token: '' }), TypeError);
  assert.throws(() => new VoipanoClient({ token: 't', serviceId: 'bad\rheader' }), TypeError);
  for (const url of ['https://user:pw@example.com/', 'file:///etc/passwd', 'https://example.com/?x=1', 'javascript:alert(1)']) {
    assert.throws(() => new VoipanoClient({ token: 't', baseUrl: url }), TypeError);
  }
  assert.throws(() => new VoipanoClient({ token: 't', timeoutMs: 0 }), TypeError);
});

const statuses = [
  [400, ApiError], [401, AuthenticationError], [403, PermissionError],
  [404, NotFoundError], [422, ValidationError], [429, RateLimitError],
  [500, ServerError], [503, ServerError],
];
for (const [status, Type] of statuses) {
  test(`HTTP ${status} -> ${Type.name}`, async () => {
    const { client } = fake(() => response({ message: 'failure', errors: { field: ['problem'] } }, status, { 'X-Request-Id': 'rid' }));
    await assert.rejects(client.services.all(), e => {
      assert.ok(e instanceof Type);
      assert.equal(e.status, status);
      assert.equal(e.requestId, 'rid');
      assert.equal(e.message, 'failure');
      assert.deepEqual(e.errors, { field: ['problem'] });
      return true;
    });
  });
}

test('HTML error does not expose content but is typed', async () => {
  const { client } = fake(() => new Response('<html>not found</html>', { status: 404, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(client.services.all(), e => e instanceof NotFoundError);
});

test('redirects are never followed', async () => {
  const { client, requests } = fake(() => new Response(null, { status: 302, headers: { Location: 'https://bad.example/' } }));
  await assert.rejects(client.calls.otp('09120000000'), e => e instanceof ApiError);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].redirect, 'manual');
});

test('transport failure on write does not retry', async () => {
  let calls = 0;
  const { client } = fake(() => { calls++; throw new Error('socket reset'); });
  await assert.rejects(client.calls.secureCall('a', 'b'), TransportError);
  assert.equal(calls, 1);
});

test('JSON parsing does not accept scalar/HTML values', async () => {
  const { client } = fake(() => new Response('<h1>error</h1>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(client.services.all(), UnexpectedResponseError);
  const other = fake(() => new Response('"hello"', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(other.client.services.all(), UnexpectedResponseError);
});

test('empty 204 succeeds with empty object', async () => {
  const { client } = fake(() => new Response(null, { status: 204 }));
  assert.deepEqual(await client.contacts.delete('one'), {});
});

test('binary audio returns actual bytes', async () => {
  const { client } = fake(() => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'Content-Type': 'audio/wav' } }));
  assert.deepEqual(Array.from(await client.recordings.call('id', 'record')), [82, 73, 70, 70]);
});
for (const contentType of ['application/json', 'text/html', 'application/problem+json', 'text/plain']) {
  test(`binary response rejects ${contentType}`, async () => {
    const { client } = fake(() => new Response('{"message":"bad"}', { headers: { 'Content-Type': contentType } }));
    await assert.rejects(client.recordings.call('id', 'record'), UnexpectedResponseError);
  });
}

test('download writes binary safely and refuses overwrite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voipano-test-'));
  const target = path.join(dir, 'recording.wav');
  try {
    const { client } = fake(() => new Response(new Uint8Array([10, 20, 30]), { headers: { 'Content-Type': 'audio/wav' } }));
    assert.equal(await client.recordings.downloadCall('cdr', 'record', target), target);
    assert.deepEqual([...fs.readFileSync(target)], [10, 20, 30]);
    await assert.rejects(client.recordings.downloadCall('cdr', 'record', target), e => e.code === 'EEXIST');
    assert.deepEqual([...fs.readFileSync(target)], [10, 20, 30]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('broken stream removes partial downloaded file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voipano-test-'));
  const target = path.join(dir, 'bad.wav');
  try {
    const { client } = fake(() => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.error(new Error('fail')); },
    }), { headers: { 'Content-Type': 'audio/wav' } }));
    await assert.rejects(client.recordings.downloadCall('cdr', 'record', target), TransportError);
    assert.equal(fs.existsSync(target), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('webhook receiver fails closed by default', async () => {
  const receiver = new WebhookReceiver();
  await assert.rejects(receiver.receive(Buffer.from('{"event":"ringing"}')), WebhookVerificationError);
});

test('webhook custom verifier receives byte-identical body and headers', async () => {
  const body = Buffer.from('{"event":"missed_call"}');
  const hdrs = { 'x-my-signature': 'ok' };
  const receiver = new WebhookReceiver({ verify: async (raw, headers) => raw === body && headers === hdrs });
  assert.deepEqual(await receiver.receive(body, hdrs), { event: 'missed_call' });
});

test('webhook verifier requires strict true and valid JSON object', async () => {
  const receiver = new WebhookReceiver({ verify: () => 1 });
  await assert.rejects(receiver.receive(Buffer.from('{}')), WebhookVerificationError);
  const trusted = new WebhookReceiver({ verify: () => true });
  await assert.rejects(trusted.receive(Buffer.from('[]')), WebhookVerificationError);
  await assert.rejects(trusted.receive(Buffer.from('oops')), WebhookVerificationError);
  await assert.rejects(trusted.receive(Buffer.from([0xff])), WebhookVerificationError);
});

test('webhook insists on raw bytes not reconstructed JSON', async () => {
  const receiver = new WebhookReceiver({ verify: () => true });
  await assert.rejects(receiver.receive('{"x":1}'), TypeError);
});
