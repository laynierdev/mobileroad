import type { AdvisorResult, AiAction, AiEnvelope, AnalysisResult, AuditResult, RecommendationsResult, RoadmapResult, ScopeImpactResult } from "@/ai/schemas";
import type { Project } from "@/domain/types";

export type AiCallResult<T> = { ok: true; envelope: AiEnvelope<T> } | { ok: false; error: string };

async function call<T>(action: AiAction, body: unknown): Promise<AiCallResult<T>> {
  try {
    const response = await fetch(`/api/ai/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as ({ ok: true } & AiEnvelope<T>) | { ok: false; error: string } | null;
    if (!json) return { ok: false, error: "The server returned an unreadable response." };
    if (!json.ok) return { ok: false, error: json.error };
    return { ok: true, envelope: { data: json.data, source: json.source, warning: json.warning } };
  } catch {
    return { ok: false, error: "Could not reach the server. Your project data is safe; try again." };
  }
}

export const aiClient = {
  analyze: (text: string, projectName?: string) => call<AnalysisResult>("analyze", { text, projectName }),
  roadmap: (brief: string, extra: { projectName?: string; platform?: string; teamSize?: number }) => call<RoadmapResult>("roadmap", { brief, ...extra }),
  ask: (project: Project, question: string, history: { role: "user" | "assistant"; content: string }[]) => call<AdvisorResult>("advisor", { project, question, history }),
  audit: (project: Project) => call<AuditResult>("audit", { project }),
  scopeChange: (project: Project, change: string) => call<ScopeImpactResult>("scope-change", { project, change }),
  recommendations: (project: Project, featureId: string) => call<RecommendationsResult>("recommendations", { project, featureId }),
};

export type UploadResult = { ok: true; text: string; fileName: string } | { ok: false; error: string };

/** Sends a document to the server for text extraction. Failures never lose what the user typed. */
export async function uploadDocument(file: File): Promise<UploadResult> {
  try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/documents/parse", { method: "POST", body: form });
    const json = (await response.json().catch(() => null)) as { ok: true; text: string; fileName: string } | { ok: false; error: string } | null;
    if (!json) return { ok: false, error: "The server returned an unreadable response. Paste the text instead." };
    return json.ok ? { ok: true, text: json.text, fileName: json.fileName } : { ok: false, error: json.error };
  } catch {
    return { ok: false, error: "Could not reach the server. Paste the text instead." };
  }
}
