/**
 * What this file does: Wraps browser-side API requests with a consistent JSON error contract.
 * What calls it: React Query hooks in `src/hooks/*`.
 * What it calls: The browser `fetch` API.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Ignoring non-2xx responses and forcing each component to remember how this API reports errors.
 */
export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new ApiClientError(payload.error ?? "Request failed.", response.status);
  }

  return payload as T;
}
