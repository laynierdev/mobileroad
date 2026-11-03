import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDemoProject } from "@/data/demoProject";
import { AiError } from "@/ai/errors";
import { createGeminiProvider, parseJsonLoose } from "@/ai/geminiProvider";
import { mockProvider } from "@/ai/mockProvider";
import { advisorSchema, analysisSchema, auditSchema, recommendationsSchema, roadmapSchema, scopeImpactSchema } from "@/ai/schemas";
import { runAi } from "@/ai/service";
import { POST } from "@/app/api/ai/[action]/route";
import { applyScopeChange } from "@/domain/features";
import { TODAY } from "./fixtures";

const project = buildDemoProject(TODAY);

describe("mock provider output is valid", () => {
  it("passes every response schema", async () => {
    expect(analysisSchema.safeParse(await mockProvider.analyzeRequirements({ text: "Customers must browse products and pay by card.\n- Admins should manage orders." })).success).toBe(true);
    expect(roadmapSchema.safeParse(await mockProvider.generateRoadmap({ brief: "A delivery app. Users can track couriers live. Drivers accept jobs." })).success).toBe(true);
    expect(recommendationsSchema.safeParse(await mockProvider.generateRecommendations(project, "order-management-api", TODAY)).success).toBe(true);
    expect(advisorSchema.safeParse(await mockProvider.answerQuestion(project, "What should I do next?", [], TODAY)).success).toBe(true);
    expect(auditSchema.safeParse(await mockProvider.auditProject(project, TODAY)).success).toBe(true);
    expect(scopeImpactSchema.safeParse(await mockProvider.analyzeScopeChange(project, "The client wants to add real-time messaging", TODAY)).success).toBe(true);
  });

  it("answers from project data, not generic text", async () => {
    const r = await mockProvider.answerQuestion(project, "Is my application ready for production?", [], TODAY);
    expect(r.answer).toContain("Not yet");
    expect(r.answer).toContain("7%");
  });

  it("audit flags the high-risk feature and is advisory", async () => {
    const audit = await mockProvider.auditProject(project, TODAY);
    expect(audit.recommendations.some((r) => r.related === "Order Management API" && r.severity === "high")).toBe(true);
    expect(audit.summary).toContain("advisory");
  });
});

describe("Gemini provider error handling", () => {
  const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  const make = (fetchImpl: typeof fetch, timeoutMs = 1000) => createGeminiProvider({ apiKey: "k", model: "m", timeoutMs, fetchImpl, retryDelayMs: 0 });
  const validAnswer = JSON.stringify({ answer: "Do X", suggestedNextSteps: ["a"] });
  const ask = (p: ReturnType<typeof make>) => p.answerQuestion(project, "q?", [], TODAY);

  it("parses valid JSON, including fenced JSON", async () => {
    expect((await ask(make(async () => ok(validAnswer)))).answer).toBe("Do X");
    expect(parseJsonLoose("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it.each([
    ["rate limit", async () => new Response("", { status: 429 }), "rate_limit"],
    ["bad key", async () => new Response("", { status: 403 }), "auth"],
    ["server error", async () => new Response("", { status: 500 }), "api"],
    ["empty response", async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }), "empty"],
    ["invalid JSON", async () => ok("not json {"), "invalid_json"],
    ["wrong shape", async () => ok(JSON.stringify({ answer: 5 })), "invalid_shape"],
    ["network failure", async () => { throw new TypeError("offline"); }, "api"],
  ])("maps %s to a typed error", async (_name, impl, code) => {
    await expect(ask(make(impl as typeof fetch))).rejects.toMatchObject({ name: "AiError", code });
  });

  it("retries once on a transient 503 and then succeeds", async () => {
    let calls = 0;
    const flaky: typeof fetch = async () => (++calls === 1 ? new Response("", { status: 503 }) : ok(validAnswer));
    expect((await ask(make(flaky))).answer).toBe("Do X");
    expect(calls).toBe(2);
  });

  it("gives up after the retry and reports an api error", async () => {
    let calls = 0;
    const down: typeof fetch = async () => (calls++, new Response("", { status: 503 }));
    await expect(ask(make(down))).rejects.toMatchObject({ code: "api" });
    expect(calls).toBe(2);
  });

  it("does not retry rate limits or bad keys", async () => {
    let calls = 0;
    await expect(ask(make(async () => (calls++, new Response("", { status: 429 }))))).rejects.toMatchObject({ code: "rate_limit" });
    expect(calls).toBe(1);
  });

  it("times out", async () => {
    const slow: typeof fetch = (_url, init) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    await expect(ask(make(slow, 20))).rejects.toMatchObject({ code: "timeout" });
  });

  it("never sends the API key in the URL", async () => {
    let seen = "";
    await ask(make(async (url) => { seen = String(url); return ok(validAnswer); }));
    expect(seen).not.toContain("k?");
    expect(seen).not.toContain("key=");
  });
});

describe("service fallback", () => {
  it("uses the mock when no provider is configured", async () => {
    const r = await runAi((p) => p.auditProject(project, TODAY), null);
    expect(r.source).toBe("mock");
    expect(r.warning).toBeUndefined();
  });

  it("falls back to the mock with a warning when the AI fails", async () => {
    const failing = { ...mockProvider, name: "gemini" as const, auditProject: async () => { throw new AiError("rate_limit", "Rate limited."); } };
    const r = await runAi((p) => p.auditProject(project, TODAY), failing);
    expect(r.source).toBe("mock");
    expect(r.warning).toContain("Rate limited.");
    expect(r.data.recommendations.length).toBeGreaterThan(0);
  });
});

describe("API route", () => {
  afterEach(() => vi.unstubAllEnvs());
  const call = (action: string, body: unknown) =>
    POST(new Request("http://x/api/ai/" + action, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ action }) });

  it("rejects invalid JSON, invalid input and unknown actions", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect((await call("advisor", "{nope")).status).toBe(400);
    expect((await call("advisor", { project, question: "" })).status).toBe(400);
    expect((await call("nothing", {})).status).toBe(404);
  });

  it("answers in mock mode without an API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await call("advisor", { project, question: "What could delay my launch?" });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, source: "mock" });
    expect(json.data.answer.length).toBeGreaterThan(10);
  });
});

describe("applying a reviewed scope change", () => {
  const input = (name: string, extra = {}) => ({ name, description: "d", groupId: "backend", priority: "high" as const, estimatedDays: 30, dependencies: ["inventory-service"], ...extra });

  it("adds only the accepted features as not started and leaves the rest untouched", () => {
    const r = applyScopeChange(project, [input("Chat Backend"), input("Chat UI", { groupId: "unknown-group", dependencies: ["ghost"] })], TODAY);
    if (!r.ok) throw new Error("expected success");
    expect(r.value.features).toHaveLength(48);
    const added = r.value.features.slice(46);
    expect(added.every((f) => f.status === "not_started")).toBe(true);
    expect(added[0].dependencies).toEqual(["inventory-service"]);
    expect(added[1].groupId).toBe(project.groups[0].id);
    expect(added[1].dependencies).toEqual([]);
    expect(added[0].schedule.kickoff! <= added[0].schedule.production!).toBe(true);
    expect(r.value.features.slice(0, 46)).toEqual(project.features);
  });

  it("rejects an empty selection and keeps ids unique", () => {
    expect(applyScopeChange(project, [], TODAY).ok).toBe(false);
    const r = applyScopeChange(project, [input("Shopping Cart")], TODAY);
    if (!r.ok) throw new Error("expected success");
    expect(new Set(r.value.features.map((f) => f.id)).size).toBe(47);
  });
});
