const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 45_000;

const cache = new Map<string, { at: number; body: unknown }>();
const inflight = new Map<string, Promise<unknown | null>>();
let cooldownUntil = 0;

function cached<T>(url: string): T | null {
  const hit = cache.get(url);
  if (!hit) return null;
  return hit.body as T;
}

export async function openMeteoJson<T>(url: string): Promise<T | null> {
  const now = Date.now();
  const fresh = cache.get(url);
  if (fresh && now - fresh.at < SUCCESS_TTL_MS) return fresh.body as T;
  if (now < cooldownUntil) return cached<T>(url);

  const pending = inflight.get(url);
  if (pending) return pending as Promise<T | null>;

  const request = (async () => {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('Retry-After'));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_COOLDOWN_MS;
        cooldownUntil = Date.now() + waitMs;
        return cached<T>(url);
      }
      if (!res.ok) return cached<T>(url);
      const body = (await res.json()) as T;
      cache.set(url, { at: Date.now(), body });
      if (cache.size > 40) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return body;
    } catch {
      return cached<T>(url);
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, request);
  return request;
}
