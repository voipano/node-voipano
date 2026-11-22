/** Node.js SDK for Voipano Public API v1 (not for browser-side secrets). */
export type Id = string | number;
export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
export type JsonResponse = Record<string, unknown> | unknown[];
export type Params = Record<string, unknown>;
export type Query = Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>;
export type CallEvent = 'ringing' | 'hangup' | 'missed_call' | 'call_details_record';
export interface ClientOptions {
  /** Secret API token. Defaults to process.env.VOIPANO_API_TOKEN. Never use in browser code. */
  token?: string;
  /** Defaults to https://voipano.com/api/v1/webservice */
  baseUrl?: string;
  /** X-Webservice-Service-Id. Defaults to process.env.VOIPANO_SERVICE_ID. */
  serviceId?: string;
  /** Total HTTP timeout in milliseconds; default 30000. */
  timeoutMs?: number;
  requestId?: string;
  /** Dependency injection for testing. */
  fetch?: typeof fetch;
}
export interface ContactsResource {
  all(filters?: Query): Promise<JsonResponse>;
  find(id: Id): Promise<JsonResponse>;
  create(data: Params): Promise<JsonResponse>;
  /** PATCH only supplied fields; empty arrays may clear fields. */
  update(id: Id, data: Params): Promise<JsonResponse>;
  /** API-compatible PUT partial update alias (not full replacement). */
  updatePut(id: Id, data: Params): Promise<JsonResponse>;
  delete(id: Id): Promise<JsonResponse>;
  bulkImport(contacts: readonly Params[], options?: Params): Promise<JsonResponse>;
}
export interface ContactGroupsResource {
  all(filters?: Query): Promise<JsonResponse>;
  create(data: Params): Promise<JsonResponse>;
  delete(id: Id): Promise<JsonResponse>;
}
export interface WebhooksResource {
  get(): Promise<JsonResponse>;
  configure(settings: Params): Promise<JsonResponse>;
  route(event: CallEvent, settings: Params): Promise<JsonResponse>;
  configureLegacy(settings: Params): Promise<JsonResponse>;
}
export interface CallsResource {
  /** Starts a real voice OTP call. No automatic retries. */
  otp(phoneNumber: string, options?: Params): Promise<JsonResponse>;
  /** Starts a real call. No automatic retries. */
  clickToCall(source: string, destination: string, options?: Params): Promise<JsonResponse>;
  /** Starts a real secure call. No automatic retries. */
  secureCall(source: string, destination: string, options?: Params): Promise<JsonResponse>;
}
export interface RecordingsResource {
  call(cdrId: Id, callDetailsRecordId: Id, query?: Query): Promise<Uint8Array>;
  voicemail(id: Id, context: string, mailbox: string, query?: Query): Promise<Uint8Array>;
  /** Refuses to overwrite an existing file and cleans up partial downloads. */
  downloadCall(cdrId: Id, callDetailsRecordId: Id, destination: string, query?: Query): Promise<string>;
  downloadVoicemail(id: Id, context: string, mailbox: string, destination: string, query?: Query): Promise<string>;
}
export class VoipanoClient {
  constructor(options?: ClientOptions | string);
  readonly token: string;
  readonly baseUrl: string;
  readonly serviceId: string;
  readonly timeoutMs: number;
  readonly requestId?: string;
  readonly services: { all(): Promise<JsonResponse> };
  readonly contacts: ContactsResource;
  readonly contactGroups: ContactGroupsResource;
  readonly musicOnHolds: { all(filters?: Query): Promise<JsonResponse> };
  readonly callReports: { all(filters?: Query): Promise<JsonResponse> };
  readonly voicemailInboxes: { all(filters?: Query): Promise<JsonResponse> };
  readonly recordings: RecordingsResource;
  readonly webhooks: WebhooksResource;
  readonly calls: CallsResource;
  withToken(token: string): VoipanoClient;
  forService(serviceId: string): VoipanoClient;
  withRequestId(requestId: string): VoipanoClient;
  /** Low-level JSON request. Only GET, POST, PUT, PATCH, DELETE allowed. */
  request(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, params?: Params): Promise<JsonResponse>;
  binary(path: string, query?: Query): Promise<Uint8Array>;
  download(path: string, destination: string, query?: Query): Promise<string>;
}
export class VoipanoError extends Error {}
export class ApiError extends VoipanoError {
  readonly status: number;
  readonly requestId?: string;
  readonly errors?: unknown;
}
export class AuthenticationError extends ApiError {}
export class PermissionError extends ApiError {}
export class NotFoundError extends ApiError {}
export class ValidationError extends ApiError {}
export class RateLimitError extends ApiError {}
export class ServerError extends ApiError {}
export class TransportError extends VoipanoError {}
export class UnexpectedResponseError extends VoipanoError {}
export class WebhookVerificationError extends VoipanoError {}
export const DEFAULT_BASE_URL: 'https://voipano.com/api/v1/webservice';
export type WebhookVerify = (rawBody: Uint8Array, headers: Record<string, string>) => boolean | Promise<boolean>;
/** Verifier must authenticate the actual Voipano signature and prevent replay attacks. */
export class WebhookReceiver {
  constructor(options?: { verify?: WebhookVerify });
  receive(rawBody: Uint8Array, headers?: Record<string, string>): Promise<Record<string, unknown>>;
}
export default VoipanoClient;
