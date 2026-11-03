/**
 * Usage limits that protect the owner's Gemini quota on a public deployment.
 *
 * Two layers, both applied before any paid AI call is made:
 *   1. per client IP, in a fixed time window;
 *   2. a daily cap for the whole site.
 * When a limit is hit the request is answered by the free offline mock instead of Gemini.
 *
 * The default counter store lives in memory, which is per server instance (best effort on serverless).
 * Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or Vercel's KV_REST_API_URL / KV_REST_API_TOKEN)
 * to share the counters across all instances and get hard limits.
 */

type Env = Record<string, string | undefined>;

export interface CounterStore {
  /** Adds one to `key`, creating it with a time-to-live when new, and returns the new count. */
  increment(key: string, ttlSec: number): Promise<number>;
}

export function createMemoryStore(now: () => number = Date.now): CounterStore {
  const entries = new Map<string, { count: number; expires: number }>();
  return {
    async increment(key, ttlSec) {
      const t = now();
      if (entries.size > 5000) for (const [k, v] of entries) if (v.expires <= t) entries.delete(k);
      const entry = entries.get(key);
      if (!entry || entry.expires <= t) {
        entries.set(key, { count: 1, expires: t + ttlSec * 1000 });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
  };
}

/** Redis over Upstash's REST API: no extra dependency, works from any serverless runtime. */
export function createUpstashStore(url: string, token: string, fetchImpl: typeof fetch = fetch): CounterStore {
  const endpoint = `${url.replace(/\/+$/, "")}/pipeline`;
  return {
    async increment(key, ttlSec) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(ttlSec), "NX"]]),
      });
      if (!response.ok) throw new Error(`Counter store answered ${response.status}`);
      const body = (await response.json()) as { result?: unknown }[];
      const count = Number(body?.[0]?.result);
      if (!Number.isFinite(count)) throw new Error("Counter store returned an unexpected answer");
      return count;
    },
  };
}

export interface AiLimits {
  perIp: number;
  windowSec: number;
  daily: number;
}

const positive = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export function readLimits(env: Env = process.env): AiLimits {
  return {
    perIp: positive(env.AI_RATE_LIMIT_PER_IP, 10),
    windowSec: positive(env.AI_RATE_LIMIT_WINDOW_SEC, 600),
    daily: positive(env.AI_DAILY_LIMIT, 200),
  };
}

export interface GateResult {
  allowed: boolean;
  message?: string;
}

/** Counts one AI request. Fails closed: if the counters cannot be read, Gemini is not called. */
export async function gateAi(store: CounterStore, limits: AiLimits, ip: string, now: Date = new Date()): Promise<GateResult> {
  try {
    const bucket = Math.floor(now.getTime() / (limits.windowSec * 1000));
    const ipCount = await store.increment(`mobileroad:ai:ip:${ip}:${bucket}`, limits.windowSec);
    if (ipCount > limits.perIp) {
      return { allowed: false, message: `You have used your ${limits.perIp} AI requests for this ${Math.max(1, Math.round(limits.windowSec / 60))}-minute period.` };
    }
    const dailyCount = await store.increment(`mobileroad:ai:daily:${now.toISOString().slice(0, 10)}`, 90_000);
    if (dailyCount > limits.daily) {
      return { allowed: false, message: "This site has reached its daily AI request limit." };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, message: "AI usage limits could not be checked right now." };
  }
}

/** Generic fixed-window limiter for non-AI routes such as uploads. */
export async function allowRequest(store: CounterStore, scope: string, ip: string, limit: number, windowSec: number, now: Date = new Date()): Promise<boolean> {
  try {
    const bucket = Math.floor(now.getTime() / (windowSec * 1000));
    return (await store.increment(`mobileroad:${scope}:${ip}:${bucket}`, windowSec)) <= limit;
  } catch {
    return false;
  }
}

let shared: CounterStore | null = null;

/** The process-wide store: Redis when configured, memory otherwise. */
export function getStore(env: Env = process.env): CounterStore {
  if (shared) return shared;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  shared = url && token ? createUpstashStore(url, token) : createMemoryStore();
  return shared;
}

/** Test helper: forget the shared store so the next call rebuilds it from the environment. */
export function resetStore() {
  shared = null;
}

/** The caller's address. Vercel overwrites X-Forwarded-For, so the first entry cannot be forged by clients there. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
