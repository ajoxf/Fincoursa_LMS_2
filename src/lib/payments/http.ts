import "server-only";

/** fetch → JSON, throwing a readable error (provider's own message) on a non-2xx response. */
export async function callJson<T = Record<string, unknown>>(provider: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    const msg = b?.error?.description ?? b?.error_description ?? b?.message ?? b?.errors?.[0]?.description ?? b?.details?.[0]?.description ?? b?.error ?? (typeof b === "string" ? b.slice(0, 200) : "");
    throw new Error(`${provider} ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
  }
  return body as T;
}

export const basicAuth = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
