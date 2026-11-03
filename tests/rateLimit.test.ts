import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as aiRoute } from "@/app/api/ai/[action]/route";
import { POST as uploadRoute } from "@/app/api/documents/parse/route";
import { allowRequest, clientIp, createMemoryStore, createUpstashStore, gateAi, readLimits, resetStore, type CounterStore } from "@/ai/rateLimit";
import { buildDemoProject } from "@/data/demoProject";
import { TODAY } from "./fixtures";

const limits = { perIp: 3, windowSec: 600, daily: 5 };
const T0 = new Date("2026-06-15T10:00:00Z");

describe("counter stores", () => {
  it("memory store counts and expires entries", async () => {
    let now = 1_000_000;
    const store = createMemoryStore(() => now);
    expect(await store.increment("k", 10)).toBe(1);
    expect(await store.increment("k", 10)).toBe(2);
    now += 11_000;
    expect(await store.increment("k", 10)).toBe(1);
  });

  it("Upstash store sends INCR + EXPIRE NX with the bearer token and reads the count", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake: typeof fetch = async (url, init) => {
      seen = { url: String(url), init: init as RequestInit };
      return new Response(JSON.stringify([{ result: 7 }, { result: 1 }]), { status: 200 });
    };
    const store = createUpstashStore("https://example.upstash.io/", "secret", fake);
    expect(await store.increment("mobileroad:test", 600)).toBe(7);
    expect(seen!.url).toBe("https://example.upstash.io/pipeline");
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("Bearer secret");
    expect(JSON.parse(seen!.init.body as string)).toEqual([["INCR", "mobileroad:test"], ["EXPIRE", "mobileroad:test", "600", "NX"]]);
  });

  it("Upstash store rejects bad answers so the gate can fail closed", async () => {
    await expect(createUpstashStore("https://x", "t", async () => new Response("", { status: 500 })).increment("k", 1)).rejects.toThrow();
    await expect(createUpstashStore("https://x", "t", async () => new Response(JSON.stringify([{ error: "nope" }]), { status: 200 })).increment("k", 1)).rejects.toThrow();
  });
});

describe("AI gate", () => {
  it("limits each IP inside the window and resets in the next one", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 3; i += 1) expect((await gateAi(store, limits, "1.1.1.1", T0)).allowed).toBe(true);
    const blocked = await gateAi(store, limits, "1.1.1.1", T0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toContain("3 AI requests");
    expect((await gateAi(store, limits, "2.2.2.2", T0)).allowed).toBe(true);
    expect((await gateAi(store, limits, "1.1.1.1", new Date(T0.getTime() + 601_000))).allowed).toBe(true);
  });

  it("enforces a daily cap shared by every visitor, without charging blocked IPs", async () => {
    const store = createMemoryStore();
    const results = [];
    for (const ip of ["a", "b", "c", "d", "e", "f"]) results.push((await gateAi(store, limits, ip, T0)).allowed);
    expect(results).toEqual([true, true, true, true, true, false]);
    expect((await gateAi(store, limits, "g", T0)).message).toContain("daily");
    // the next UTC day starts a fresh budget
    expect((await gateAi(store, limits, "g", new Date("2026-06-16T00:30:00Z"))).allowed).toBe(true);
  });

  it("fails closed when the counters are unavailable", async () => {
    const broken: CounterStore = { increment: async () => { throw new Error("down"); } };
    const result = await gateAi(broken, limits, "1.1.1.1", T0);
    expect(result.allowed).toBe(false);
    expect(await allowRequest(broken, "upload", "1.1.1.1", 5, 600)).toBe(false);
  });

  it("reads limits from the environment and ignores invalid values", () => {
    expect(readLimits({})).toEqual({ perIp: 10, windowSec: 600, daily: 200 });
    expect(readLimits({ AI_RATE_LIMIT_PER_IP: "4", AI_RATE_LIMIT_WINDOW_SEC: "60", AI_DAILY_LIMIT: "50" })).toEqual({ perIp: 4, windowSec: 60, daily: 50 });
    expect(readLimits({ AI_RATE_LIMIT_PER_IP: "abc", AI_DAILY_LIMIT: "-3" })).toMatchObject({ perIp: 10, daily: 200 });
  });

  it("takes the client address from the forwarding headers", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "8.8.8.8" } }))).toBe("8.8.8.8");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("routes", () => {
  const project = buildDemoProject(TODAY);
  const geminiAnswer = JSON.stringify({ answer: "From Gemini", suggestedNextSteps: ["Do X"] });
  let geminiCalls = 0;

  beforeEach(() => {
    resetStore();
    geminiCalls = 0;
    vi.stubGlobal("fetch", async () => {
      geminiCalls += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiAnswer }] } }] }), { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetStore();
  });

  const ask = (ip: string, body: unknown = { project, question: "What should I do next?" }) =>
    aiRoute(new Request("http://x/api/ai/advisor", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) }), { params: Promise.resolve({ action: "advisor" }) });

  it("falls back to the free mock once an IP exceeds its limit, and never calls Gemini again", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("AI_RATE_LIMIT_PER_IP", "2");
    const sources: string[] = [];
    for (let i = 0; i < 3; i += 1) sources.push((await (await ask("5.5.5.5")).json()).source);
    expect(sources).toEqual(["gemini", "gemini", "mock"]);
    expect(geminiCalls).toBe(2);

    const limited = await (await ask("5.5.5.5")).json();
    expect(limited.warning).toContain("AI requests");
    expect(limited.data.answer.length).toBeGreaterThan(5);

    expect((await (await ask("6.6.6.6")).json()).source).toBe("gemini");
    expect(geminiCalls).toBe(3);
  });

  it("stops Gemini for everyone after the daily cap", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("AI_DAILY_LIMIT", "2");
    await ask("1.0.0.1");
    await ask("1.0.0.2");
    const third = await (await ask("1.0.0.3")).json();
    expect(third.source).toBe("mock");
    expect(third.warning).toContain("daily");
    expect(geminiCalls).toBe(2);
  });

  it("does not count invalid requests or limit mock mode", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("AI_RATE_LIMIT_PER_IP", "1");
    for (let i = 0; i < 5; i += 1) expect((await ask("7.7.7.7", { project, question: "" })).status).toBe(400);
    expect((await (await ask("7.7.7.7")).json()).source).toBe("gemini");

    vi.stubEnv("GEMINI_API_KEY", "");
    resetStore();
    for (let i = 0; i < 5; i += 1) {
      const json = await (await ask("7.7.7.8")).json();
      expect(json).toMatchObject({ source: "mock" });
      expect(json.warning).toBeUndefined();
    }
  });

  it("limits document uploads per IP with a 429", async () => {
    const upload = () => {
      const form = new FormData();
      form.append("file", new File(["The app must send reminders."], "r.txt"));
      return uploadRoute(new Request("http://x/api/documents/parse", { method: "POST", headers: { "x-forwarded-for": "4.4.4.4" }, body: form }));
    };
    for (let i = 0; i < 20; i += 1) expect((await upload()).status).toBe(200);
    const blocked = await upload();
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).code).toBe("rate_limited");
  });
});
