import type { ZodType } from "zod";
import type { Project } from "@/domain/types";
import { projectContext } from "./context";
import { AiError } from "./errors";
import type { AdvisorTurn, AiProvider } from "./provider";
import {
  advisorSchema,
  analysisSchema,
  auditSchema,
  recommendationsSchema,
  roadmapSchema,
  scopeImpactSchema,
} from "./schemas";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  /** Extra attempts after a transient 5xx answer. Default 1. */
  retries?: number;
  retryDelayMs?: number;
}

/** Overload / gateway answers that usually succeed when repeated. */
const TRANSIENT = new Set([500, 502, 503, 504]);

const SYSTEM = [
  "You are MobileRoad's senior technical project manager for mobile app projects.",
  "Explain things in plain language for non-technical readers; avoid unexplained jargon.",
  "Use only the project data provided. Never invent facts and never claim a task is complete unless the data says so.",
  "Separate explicit requirements from inferred ones and from assumptions.",
  "Reply with a single JSON object that matches the requested shape. No markdown, no commentary.",
].join(" ");

/** Removes a ```json fence if the model added one, then parses. */
export function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AiError("invalid_json", "The AI returned a response that is not valid JSON.");
  }
}

export function createGeminiProvider(config: GeminiConfig): AiProvider {
  const doFetch = config.fetchImpl ?? fetch;

  async function generate<T>(schema: ZodType<T>, shape: string, prompt: string): Promise<T> {
    const requestBody = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `${prompt}

Return JSON with exactly this shape:
${shape}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
    });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;

    const attempt = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        return await doFetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": config.apiKey }, body: requestBody, signal: controller.signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new AiError("timeout", "The AI took too long to respond. Please try again.");
        throw new AiError("api", "Could not reach the AI service.");
      } finally {
        clearTimeout(timer);
      }
    };

    let response = await attempt();
    for (let n = 0; n < (config.retries ?? 1) && TRANSIENT.has(response.status); n += 1) {
      await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs ?? 1500));
      response = await attempt();
    }

    if (response.status === 429) throw new AiError("rate_limit", "The AI service is rate limited right now. Wait a moment and retry.");
    if (response.status === 401 || response.status === 403 || response.status === 400) {
      const body = await response.text().catch(() => "");
      if (response.status !== 400 || /API key/i.test(body)) throw new AiError("auth", "The Gemini API key was rejected. Check GEMINI_API_KEY.");
      throw new AiError("api", "The AI service rejected the request.");
    }
    if (!response.ok) throw new AiError("api", `The AI service returned an error (${response.status}).`);

    const payload = (await response.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    } | null;
    if (payload?.promptFeedback?.blockReason) throw new AiError("empty", "The AI declined to answer this request.");
    const raw = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    if (!raw) throw new AiError("empty", "The AI returned an empty response.");

    const parsed = schema.safeParse(parseJsonLoose(raw));
    if (!parsed.success) throw new AiError("invalid_shape", "The AI response did not have the expected structure.");
    return parsed.data;
  }

  const ctx = (project: Project, today: Date) => JSON.stringify(projectContext(project, today));

  return {
    name: "gemini",

    analyzeRequirements: ({ text, projectName }) =>
      generate(
        analysisSchema,
        `{"summary":string,"businessObjectives":string[],"userRoles":string[],"functionalRequirements":[{"text":string,"kind":"explicit"|"inferred"}],"nonFunctionalRequirements":[{"text":string,"kind":"explicit"|"inferred"}],"majorFeatures":string[],"externalIntegrations":string[],"securityRequirements":string[],"risks":string[],"assumptions":string[],"missingInformation":string[],"questions":string[],"dependencies":string[],"implementationApproaches":string[]}`,
        `Analyze these mobile app requirements${projectName ? ` for "${projectName}"` : ""}. Mark a requirement "explicit" only if it is stated in the text; otherwise "inferred". List what is missing instead of inventing it.\n\n<requirements>\n${text}\n</requirements>`,
      ),

    generateRoadmap: ({ brief, projectName, platform, teamSize }) =>
      generate(
        roadmapSchema,
        `{"phases":[{"name":string,"description":string,"objective":string,"estimatedDurationWeeks":number,"tasks":string[],"dependencies":string[],"deliverables":string[],"risks":string[],"recommendedTools":string[],"acceptanceCriteria":string[],"checkpoints":string[],"completionRequirements":string[],"keyRecommendation":string,"beginnerExplanation":string}],"features":[{"name":string,"group":string,"description":string,"priority":"low"|"medium"|"high"|"critical","estimatedDays":number}]}`,
        `Create a complete roadmap from business idea to production and ongoing support for${projectName ? ` "${projectName}"` : " this project"}${platform ? ` (${platform})` : ""}${teamSize ? `, team of ${teamSize}` : ""}. Cover discovery, UX/UI, architecture, development, QA, UAT, staging, production and support. Match the roadmap's size to the project's complexity: a small app needs about 10 features, a typical product 15 to 25. Each feature is one deliverable a team can track (not a phase), with a realistic estimatedDays. Group features by area using these group names where relevant: Authentication, Backend Services, UI/UX, Mobile Application, Infrastructure, Testing, Deployment, Analytics. Always include Infrastructure (environments, CI/CD, monitoring), Testing and Deployment (store submission) features, plus one feature per capability named in the brief.\n\n<brief>\n${brief}\n</brief>`,
      ),

    generateRecommendations: (project, featureId, today) =>
      generate(
        recommendationsSchema,
        `{"recommendations":[{"title":string,"detail":string}]}`,
        `Give 3 to 6 practical recommendations for the feature with id "${featureId}". Consider its status, dates, dependencies, checkpoints and risks.\n\n<project>\n${ctx(project, today)}\n</project>`,
      ),

    answerQuestion: (project, question, history: AdvisorTurn[], today) =>
      generate(
        advisorSchema,
        `{"answer":string,"suggestedNextSteps":string[]}`,
        `Answer the user's question about their project using the actual data. Be specific (name features and dates), concise and beginner friendly.\n\n<project>\n${ctx(project, today)}\n</project>\n\n<conversation>\n${history.map((h) => `${h.role}: ${h.content}`).join("\n")}\n</conversation>\n\nQuestion: ${question}`,
      ),

    auditProject: (project, today) =>
      generate(
        auditSchema,
        `{"summary":string,"recommendations":[{"severity":"low"|"medium"|"high"|"critical","description":string,"whyItMatters":string,"suggestedAction":string,"related":string}]}`,
        `Audit this roadmap. Look for missing tasks, incomplete prerequisites, risks, unrealistic deadlines, missing testing, deployment readiness, security and maintenance concerns. In "related" name the phase or feature. This is advisory only.\n\n<project>\n${ctx(project, today)}\n</project>`,
      ),

    analyzeScopeChange: (project, change, today) =>
      generate(
        scopeImpactSchema,
        `{"summary":string,"affectedFeatures":string[] (feature names),"newFeatures":[{"name":string,"description":string,"group":string (a group id from the project),"priority":"low"|"medium"|"high"|"critical","estimatedDays":number,"dependencies":string[] (existing feature ids)}],"additionalDependencies":string[],"architecturalImplications":string[],"risks":string[],"testingImplications":string[],"deploymentImplications":string[],"scheduleImpactDays":number,"scheduleImpactNote":string}`,
        `Analyze the impact of this requested change on the roadmap: "${change}".\n\n<project>\n${ctx(project, today)}\n</project>`,
      ),
  };
}
