/** Error thrown for any non-2xx DOKU API response (or a failed transport). */
export class DokuApiError extends Error {
  readonly status: number;
  /** Parsed JSON body when possible, otherwise the raw text */
  readonly body: unknown;
  readonly headers: Record<string, string>;

  constructor(message: string, status: number, body: unknown, headers: Record<string, string>) {
    super(message);
    this.name = "DokuApiError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

export interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function httpRequest(options: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  fetchImpl?: typeof fetch;
}): Promise<HttpResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });
  } catch (cause) {
    throw new DokuApiError(
      `DOKU request failed: ${options.method} ${options.url} (${String(cause)})`,
      0,
      undefined,
      {},
    );
  }
  const body = await parseBody(response);
  const headers = headersToObject(response.headers);
  if (!response.ok) {
    throw new DokuApiError(
      `DOKU API error ${response.status} for ${options.method} ${options.url}`,
      response.status,
      body,
      headers,
    );
  }
  return { status: response.status, headers, body };
}
