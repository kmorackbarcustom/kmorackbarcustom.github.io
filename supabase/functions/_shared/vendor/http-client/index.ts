// Vendored from D:\AI-Workspace\projects\modules-hub\http-client-module on 2026-08-12. Edit only this copy, never modules-hub.
export { createHttpClient } from './core/client.ts';
export { HttpError } from './core/error.ts';
export { createFetchTransport } from './adapters/fetch-transport.ts';
export type { HttpErrorCode } from './core/error.ts';
export type {
  FetchTransportOptions,
  HttpClient,
  HttpClientConfig,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  LoggingHooks,
  RetryPolicy,
  SanitizedRequestInfo,
  SanitizedResponseInfo,
  TransportRequest,
  TransportResponse,
  UrlPolicy,
} from './core/types.ts';
