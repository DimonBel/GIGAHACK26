import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, CSRF_HEADER, errorMessage, request, setCsrfToken, setUnauthorizedHandler, upload } from './client';

const TOKEN = 'csrf-token-for-tests';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastFetch(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.lastCall as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

describe('request', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    setCsrfToken(TOKEN);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    setCsrfToken(null);
    setUnauthorizedHandler(null);
  });

  it('sends the CSRF token and the same-origin cookie with every write', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1 }));

    await expect(request('/users', { method: 'POST', body: { full_name: 'Ana' } })).resolves.toEqual({ id: 1 });

    const { url, init, headers } = lastFetch(fetchMock);
    expect(url).toBe('/api/users');
    expect(init.credentials).toBe('same-origin');
    expect(headers.get(CSRF_HEADER)).toBe(TOKEN);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ full_name: 'Ana' }));
  });

  it.each(['PUT', 'PATCH', 'DELETE'] as const)('sends the CSRF token with %s', async (method) => {
    fetchMock.mockResolvedValue(jsonResponse(204));
    await request('/lists/3', { method });
    expect(lastFetch(fetchMock).headers.get(CSRF_HEADER)).toBe(TOKEN);
  });

  it('does not send the CSRF token with reads, and keeps query parameters that have a value', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await request('/audit', { query: { meeting_id: 'abc', limit: undefined, empty: '' } });

    const { url, headers, init } = lastFetch(fetchMock);
    expect(url).toBe('/api/audit?meeting_id=abc');
    expect(headers.has(CSRF_HEADER)).toBe(false);
    expect(init.credentials).toBe('same-origin');
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(jsonResponse(204));
    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('signs the user out on 401', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Not signed in' }));

    const error = await request('/meetings').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'Not signed in' });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not sign out when a 401 is the expected answer (login, session check)', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: 'Wrong email or password' }));

    await expect(request('/auth/login', { method: 'POST', body: {}, expectUnauthorized: true })).rejects.toMatchObject({
      status: 401,
      message: 'Wrong email or password',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("uses the server's detail as the error message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { detail: 'Not possible while the meeting is sent' }));
    await expect(request('/meetings/1/approve', { method: 'POST' })).rejects.toMatchObject({
      status: 409,
      message: 'Not possible while the meeting is sent',
    });
  });

  it('reports an unreachable server as status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await request('/meetings').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
    expect((error as ApiError).message).toMatch(/cannot be reached/);
  });
});

describe('errorMessage', () => {
  it('joins FastAPI validation errors', () => {
    const body = { detail: [{ loc: ['body', 'email'], msg: 'invalid email' }, { msg: 'too short' }] };
    expect(errorMessage(422, body)).toBe('invalid email; too short');
  });

  it('falls back to a message for the status code', () => {
    expect(errorMessage(413, '<html>Too large</html>')).toMatch(/upload limit/);
    expect(errorMessage(502, undefined)).toMatch(/HTTP 502/);
  });
});

/** Just enough of XMLHttpRequest to check what upload() sends and how it reads the answer. */
class FakeXhr {
  static last: FakeXhr;
  headers: Record<string, string> = {};
  method = '';
  url = '';
  body: unknown;
  status = 0;
  responseText = '';
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.onabort?.();
  }

  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

describe('upload', () => {
  beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    setCsrfToken(TOKEN);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
    setUnauthorizedHandler(null);
  });

  it('posts the form with the CSRF token and reports progress', async () => {
    const onProgress = vi.fn();
    const form = new FormData();
    const result = upload('/meetings', form, { onProgress });

    const xhr = FakeXhr.last;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/meetings');
    expect(xhr.headers[CSRF_HEADER]).toBe(TOKEN);
    expect(xhr.body).toBe(form);

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 });
    expect(onProgress).toHaveBeenCalledWith(0.25);

    xhr.respond(201, { id: 'm1', status: 'queued' });
    await expect(result).resolves.toEqual({ id: 'm1', status: 'queued' });
  });

  it("rejects with the server's detail and signs out on 401", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);

    const tooLarge = upload('/meetings', new FormData());
    FakeXhr.last.respond(413, { detail: 'The file is larger than 500 MB' });
    await expect(tooLarge).rejects.toMatchObject({ status: 413, message: 'The file is larger than 500 MB' });
    expect(onUnauthorized).not.toHaveBeenCalled();

    const expired = upload('/meetings', new FormData());
    FakeXhr.last.respond(401, { detail: 'Not signed in' });
    await expect(expired).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const result = upload('/meetings', new FormData(), { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});
