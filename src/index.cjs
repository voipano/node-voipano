'use strict';

// Voipano Public API v1 — Node.js-only client. Uses native fetch; no runtime dependencies.
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');

const DEFAULT_BASE_URL = 'https://voipano.com/api/v1/webservice';
const ALLOWED_EVENTS = new Set(['ringing', 'hangup', 'missed_call', 'call_details_record']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const VERSION = '1.0.0';

class VoipanoError extends Error {
  constructor(message, options = {}) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
  }
}
class ApiError extends VoipanoError {
  constructor(message, { status = 0, requestId = undefined, errors = undefined } = {}) {
    super(message);
    this.status = status;
    this.requestId = requestId;
    this.errors = errors;
  }
}
class AuthenticationError extends ApiError {}
class PermissionError extends ApiError {}
class NotFoundError extends ApiError {}
class ValidationError extends ApiError {}
class RateLimitError extends ApiError {}
class ServerError extends ApiError {}
class TransportError extends VoipanoError {}
class UnexpectedResponseError extends VoipanoError {}
class WebhookVerificationError extends VoipanoError {}

function required(value, name) {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      !String(value).trim() || !Number.isFinite(Number(value)) && typeof value === 'number') {
    throw new TypeError(`${name} must be a nonempty string or finite number`);
  }
  return String(value);
}
function headerValue(value, name, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || /[\x00-\x1F\x7F]/u.test(value)) {
    throw new TypeError(`${name} must be a ${allowEmpty ? 'valid' : 'nonempty'} header string`);
  }
  return value;
}
function validateBaseUrl(value) {
  if (typeof value !== 'string' || /[\x00-\x20\x7F]/u.test(value)) throw new TypeError('Invalid baseUrl');
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Invalid baseUrl'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash ||
      url.pathname.split('/').some(s => s === '.' || s === '..')) {
    throw new TypeError('baseUrl must be an absolute HTTP(S) URL without credentials, query or fragment');
  }
  return url.toString().replace(/\/$/u, '');
}
function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
      /[?#\\\x00-\x1F\x7F]/u.test(path) || path.split('/').some(p => p === '.' || p === '..')) {
    throw new TypeError('Invalid API path');
  }
  return path;
}
function segment(value) {
  const v = required(value, 'Resource ID');
  if (v.split('/').some(part => part === '.' || part === '..') || /[\x00-\x1F\x7F]/u.test(v)) throw new TypeError('Invalid resource identifier');
  return encodeURIComponent(v).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
function object(value, name = 'options') {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  return value;
}
function appendQuery(url, values) {
  for (const [k, value] of Object.entries(object(values, 'query'))) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const entry of value) if (entry !== null && entry !== undefined) url.searchParams.append(k, String(entry));
    } else if (typeof value === 'object') {
      throw new TypeError(`Query parameter ${k} must be scalar or array`);
    } else url.searchParams.append(k, String(value));
  }
}
async function boundedError(response) {
  // Only read at most 8192 bytes from an untrusted error response.
  let bytes = new Uint8Array();
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const parts = [];
    let count = 0;
    try {
      while (count < 8192) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = value.subarray(0, 8192 - count);
        parts.push(part);
        count += part.byteLength;
      }
    } finally { await reader.cancel().catch(() => {}); }
    bytes = new Uint8Array(count);
    let offset = 0;
    for (const p of parts) { bytes.set(p, offset); offset += p.byteLength; }
  } else { bytes = new Uint8Array((await response.arrayBuffer()).slice(0, 8192)); }
  let payload = {};
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* not JSON */ }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
  const msg = typeof payload.message === 'string' ? payload.message :
    typeof payload.error === 'string' ? payload.error : `Voipano API returned HTTP ${response.status}.`;
  const opts = { status: response.status, requestId: response.headers.get('x-request-id') || undefined, errors: payload.errors };
  const Type = ({ 401: AuthenticationError, 403: PermissionError, 404: NotFoundError,
    422: ValidationError, 429: RateLimitError })[response.status] || (response.status >= 500 ? ServerError : ApiError);
  return new Type(msg, opts);
}
function ensureBinary(response) {
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType === 'application/json' || contentType === 'text/html' ||
      contentType.startsWith('text/') || contentType.endsWith('+json')) {
    throw new UnexpectedResponseError(`Expected binary recording, got ${contentType}`);
  }
}
function timeoutMs(value) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError('timeoutMs must be a positive finite number');
  return value;
}

class VoipanoClient {
  constructor(options = {}) {
    const config = typeof options === 'string' ? { token: options } : object(options);
    this.token = headerValue(config.token ?? process.env.VOIPANO_API_TOKEN ?? '', 'token');
    this.serviceId = headerValue(config.serviceId ?? process.env.VOIPANO_SERVICE_ID ?? '', 'serviceId', { allowEmpty: true });
    this.baseUrl = validateBaseUrl(config.baseUrl ?? process.env.VOIPANO_BASE_URL ?? DEFAULT_BASE_URL);
    this.timeoutMs = timeoutMs(config.timeoutMs ?? 30000);
    this.requestId = config.requestId === undefined ? undefined : headerValue(config.requestId, 'requestId');
    this.fetch = config.fetch ?? globalThis.fetch;
    if (typeof this.fetch !== 'function') throw new TypeError('Fetch API required (Node.js 22+)');
    this.services = Object.freeze({ all: () => this.request('GET', '/services') });
    this.contacts = Object.freeze({
      all: filters => this.request('GET', '/contacts', filters),
      find: id => this.request('GET', `/contacts/${segment(id)}`),
      create: data => this.request('POST', '/contacts', object(data, 'contact')),
      update: (id, data) => this.request('PATCH', `/contacts/${segment(id)}`, object(data, 'contact')),
      updatePut: (id, data) => this.request('PUT', `/contacts/${segment(id)}`, object(data, 'contact')),
      delete: id => this.request('DELETE', `/contacts/${segment(id)}`),
      bulkImport: (contacts, options = {}) => {
        if (!Array.isArray(contacts) || contacts.length < 1 || contacts.length > 3000 ||
            contacts.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
          throw new TypeError('contacts must contain 1 to 3000 objects');
        }
        return this.request('POST', '/contacts/bulk-import', { ...object(options), contacts });
      },
    });
    this.contactGroups = Object.freeze({
      all: filters => this.request('GET', '/contact-groups', filters),
      create: data => this.request('POST', '/contact-groups', object(data)),
      delete: id => this.request('DELETE', `/contact-groups/${segment(id)}`),
    });
    this.musicOnHolds = Object.freeze({ all: filters => this.request('GET', '/music-on-holds', filters) });
    this.callReports = Object.freeze({ all: filters => this.request('GET', '/call-reports', filters) });
    this.voicemailInboxes = Object.freeze({ all: filters => this.request('GET', '/voicemail-inboxes', filters) });
    this.webhooks = Object.freeze({
      get: () => this.request('GET', '/call-events-webhook'),
      configure: data => this.request('PUT', '/call-events-webhook', object(data)),
      route: (event, data) => {
        if (!ALLOWED_EVENTS.has(event)) throw new TypeError('Unsupported webhook event');
        return this.request('PUT', '/call-events-webhook', { ...object(data), event });
      },
      configureLegacy: data => this.request('POST', '/call-events-webhook', object(data)),
    });
    this.calls = Object.freeze({
      otp: (phoneNumber, options = {}) => this.request('POST', '/call-otp', {
        ...object(options), phone_number: required(phoneNumber, 'phoneNumber'),
      }),
      clickToCall: (source, destination, options = {}) => this.request('POST', '/click-to-call', {
        ...object(options), call_source: required(source, 'source'), call_destination: required(destination, 'destination'),
      }),
      secureCall: (source, destination, options = {}) => this.request('POST', '/secure-call', {
        ...object(options), call_source: required(source, 'source'), call_destination: required(destination, 'destination'),
      }),
    });
    this.recordings = Object.freeze({
      call: (cdrId, recordId, query = {}) => this.binary(`/call-recordings/${segment(cdrId)}`,
        { ...object(query), call_details_record_id: required(recordId, 'callDetailsRecordId') }),
      voicemail: (id, context, mailbox, query = {}) => this.binary(`/voicemail-recordings/${segment(id)}`,
        { ...object(query), context: required(context, 'context'), mailbox: required(mailbox, 'mailbox') }),
      downloadCall: (cdrId, recordId, destination, query = {}) => this.download(`/call-recordings/${segment(cdrId)}`,
        destination, { ...object(query), call_details_record_id: required(recordId, 'callDetailsRecordId') }),
      downloadVoicemail: (id, context, mailbox, destination, query = {}) => this.download(`/voicemail-recordings/${segment(id)}`,
        destination, { ...object(query), context: required(context, 'context'), mailbox: required(mailbox, 'mailbox') }),
    });
  }
  _clone(changes) { return new VoipanoClient({
    token: this.token, serviceId: this.serviceId, baseUrl: this.baseUrl, timeoutMs: this.timeoutMs,
    requestId: this.requestId, fetch: this.fetch, ...changes,
  }); }
  withToken(token) { return this._clone({ token }); }
  forService(serviceId) { return this._clone({ serviceId }); }
  withRequestId(requestId) { return this._clone({ requestId }); }
  async _send(method, path, data, { binary = false, signal } = {}) {
    method = String(method).toUpperCase();
    if (!HTTP_METHODS.has(method)) throw new TypeError('Unsupported HTTP method');
    const route = safePath(path);
    const url = new URL(this.baseUrl + route);
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: binary ? '*/*' : 'application/json',
      'X-Request-Id': this.requestId ?? randomUUID(),
      'User-Agent': `voipano-node/${VERSION}`,
    };
    if (this.serviceId.trim()) headers['X-Webservice-Service-Id'] = this.serviceId;
    const options = { method, headers, redirect: 'manual', cache: 'no-store' };
    if (method === 'GET') appendQuery(url, data);
    else if (method !== 'DELETE') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(object(data, 'body'));
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    options.signal = signal ? AbortSignal.any([timeout, signal]) : timeout;
    try {
      const res = await this.fetch(url.toString(), options);
      if (!res || typeof res.status !== 'number' || typeof res.arrayBuffer !== 'function' || !res.headers) {
        throw new UnexpectedResponseError('Invalid fetch response');
      }
      if (res.status < 200 || res.status >= 300) throw await boundedError(res);
      if (binary) {
        ensureBinary(res);
        return res;
      }
      if (res.status === 204) return {};
      let text = await res.text();
      if (!text.trim()) return {};
      let json;
      try { json = JSON.parse(text); } catch { throw new UnexpectedResponseError('Expected JSON response'); }
      if (!json || typeof json !== 'object') throw new UnexpectedResponseError('Expected JSON object or array');
      return json;
    } catch (err) {
      if (err instanceof VoipanoError) throw err;
      throw new TransportError('Voipano HTTP request failed; the outcome of a write may be unknown.', { cause: err });
    }
  }
  request(method, path, params = {}) { return this._send(method, path, params); }
  async binary(path, query = {}) {
    const response = await this._send('GET', path, query, { binary: true });
    try { return new Uint8Array(await response.arrayBuffer()); }
    catch (error) { throw new TransportError('Recording download failed', { cause: error }); }
  }
  async download(path, destination, query = {}) {
    if (typeof destination !== 'string' || !destination.trim()) throw new TypeError('destination must be a file path');
    // "wx" refuses existing files/symlinks. Never silently overwrite a recording.
    const response = await this._send('GET', path, query, { binary: true });
    let created = false;
    try {
      if (!response.body) throw new UnexpectedResponseError('Empty recording stream');
      const writer = fs.createWriteStream(destination, { flags: 'wx' });
      writer.on('open', () => { created = true; });
      await pipeline(Readable.fromWeb(response.body), writer);
      return destination;
    } catch (error) {
      if (created) await fs.promises.unlink(destination).catch(() => {});
      if (error instanceof VoipanoError) throw error;
      if (error && error.code === 'EEXIST') throw error;
      throw new TransportError('Recording download failed', { cause: error });
    }
  }
}

class WebhookReceiver {
  // Deliberately fail closed: collection does not define signature format or replay defense.
  constructor({ verify } = {}) { this.verify = verify ?? (() => false); if (typeof this.verify !== 'function') throw new TypeError('verify must be a function'); }
  async receive(rawBody, headers = {}) {
    if (!(rawBody instanceof Uint8Array)) throw new TypeError('Raw webhook body must be Uint8Array or Buffer');
    if (await this.verify(rawBody, headers) !== true) throw new WebhookVerificationError('Webhook verification failed');
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)); }
    catch { throw new WebhookVerificationError('Webhook body is not valid JSON'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WebhookVerificationError('Webhook JSON must be an object');
    return value;
  }
}

module.exports = {
  VoipanoClient, WebhookReceiver, DEFAULT_BASE_URL,
  VoipanoError, ApiError, AuthenticationError, PermissionError, NotFoundError,
  ValidationError, RateLimitError, ServerError, TransportError,
  UnexpectedResponseError, WebhookVerificationError,
};
