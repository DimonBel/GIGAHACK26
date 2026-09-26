/** HTTP client for the Secure MOM API: same-origin session cookie, CSRF header on writes, typed errors. */

export const API_BASE = '/api';
export const CSRF_HEADER = 'X-CSRF-Token';
const UNREACHABLE = 'The Secure MOM server cannot be reached. Check that it is running.';

const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request is invalid.',
  401: 'Please sign in.',
  403: 'You are not allowed to do this.',
  404: 'Not found.',
  409: 'This action is not possible in the current state.',
  413: 'The file is larger or longer than the upload limit.',
  415: 'The file has no audio stream.',
  429: 'Too many attempts. Try again later.',
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Query = Record<string, string | number | undefined>;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
  /** A 401 is a normal answer here (login, session check), not an expired session. */
  expectUnauthorized?: boolean;
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

let csrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Keeps the CSRF token from login or /auth/me for every later write. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

/** Sets what happens when the session is gone (401 on a normal request). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** URL of an API path with the query parameters that have a value. */
export function apiUrl(path: string, query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_BASE}${path}${search ? `?${search}` : ''}`;
}

/** The server's "detail" (FastAPI validation errors included) or a message for the status code. */
export function errorMessage(status: number, body: unknown): string {
  const detail = typeof body === 'object' && body !== null && 'detail' in body ? body.detail : undefined;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item: unknown) => (typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : ''))
      .filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return STATUS_MESSAGES[status] ?? `The server answered with an error (HTTP ${status}).`;
}

/** True when a request was cancelled on purpose. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function parseJson(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function failure(status: number, body: unknown, expectUnauthorized = false): ApiError {
  if (status === 401 && !expectUnauthorized) unauthorizedHandler?.();
  return new ApiError(status, errorMessage(status, body));
}

function requestHeaders(method: Method, json: boolean): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  if (json) headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && csrfToken) headers.set(CSRF_HEADER, csrfToken);
  return headers;
}

/** Sends a JSON request and returns the parsed answer (undefined for 204). */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined;
  let response: Response;
  try {
    response = await fetch(apiUrl(path, options.query), {
      method,
      credentials: 'same-origin',
      headers: requestHeaders(method, hasBody),
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, UNREACHABLE);
  }
  const body = parseJson(await response.text());
  if (!response.ok) throw failure(response.status, body, options.expectUnauthorized);
  return body as T;
}

/** Posts multipart form data, reporting upload progress (fetch cannot). */
export function upload<T>(path: string, form: FormData, { onProgress, signal }: UploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled.', 'AbortError'));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(path));
    xhr.setRequestHeader('Accept', 'application/json');
    if (csrfToken) xhr.setRequestHeader(CSRF_HEADER, csrfToken);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      const body = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(failure(xhr.status, body));
    };
    xhr.onerror = () => reject(new ApiError(0, UNREACHABLE));
    xhr.onabort = () => reject(new DOMException('Upload cancelled.', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}
