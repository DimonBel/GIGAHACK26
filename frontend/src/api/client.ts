/** The one way the app talks to the server: JSON over fetch under /api (same origin, session cookie). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let onUnauthorized: () => void = () => {};

/** Called when a request finds the session gone (expired, or signed out elsewhere). */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

/** FastAPI errors: {"detail": "text"} or {"detail": [{"msg": ...}]} (validation). */
function errorMessage(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length)
    return String((detail[0] as { msg?: string }).msg ?? "Invalid request");
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return `Request failed (${status})`;
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readBody(res: Response): Promise<unknown> {
  return parse(await res.text());
}

function fail(status: number, body: unknown, quiet: boolean): never {
  if (status === 401 && !quiet) onUnauthorized();
  throw new ApiError(status, errorMessage(status, body));
}

interface RequestOptions {
  /** Don't treat a 401 as "session expired" (sign-in and session restore expect it). */
  quiet401?: boolean;
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "The server cannot be reached. Is it running?");
  }
  const data = await readBody(res);
  if (!res.ok) fail(res.status, data, options.quiet401 ?? false);
  return data as T;
}

/** multipart upload with progress (fetch cannot report upload progress). */
export function upload<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () =>
      reject(new ApiError(0, "The upload was interrupted. Check the connection and try again."));
    xhr.onload = () => {
      const data = parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        try {
          fail(xhr.status, data, false);
        } catch (e) {
          reject(e as Error);
        }
      }
    };
    xhr.send(form);
  });
}
