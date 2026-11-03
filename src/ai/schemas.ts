import { z } from "zod";
import { prioritySchema, projectSchema } from "@/domain/schemas";

/* ---------- Requests (validated by the API route) ---------- */

export const analyzeRequestSchema = z.object({
  text: z.string().trim().min(10, "Provide at least a short description of the project.").max(60_000),
  projectName: z.string().max(120).optional(),
});

export const roadmapRequestSchema = z.object({
  brief: z.string().trim().min(10).max(60_000),
  projectName: z.string().max(120).optional(),
  platform: z.string().max(40).optional(),
  teamSize: z.number().int().min(1).max(500).optional(),
});

export const recommendationsRequestSchema = z.object({ project: projectSchema, featureId: z.string().min(1) });

export const advisorRequestSchema = z.object({
  project: projectSchema,
  question: z.string().trim().min(2, "Ask a question.").max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(10).default([]),
});

export const auditRequestSchema = z.object({ project: projectSchema });

export const scopeChangeRequestSchema = z.object({
  project: projectSchema,
  change: z.string().trim().min(5, "Describe the change.").max(2000),
});

/* ---------- Responses (validated after every AI call) ---------- */

const text = z.string().trim().min(1);
const list = z.array(text).default([]);

export const requirementSchema = z.object({ text, kind: z.enum(["explicit", "inferred"]) });

export const analysisSchema = z.object({
  summary: text,
  businessObjectives: list,
  userRoles: list,
  functionalRequirements: z.array(requirementSchema).default([]),
  nonFunctionalRequirements: z.array(requirementSchema).default([]),
  majorFeatures: list,
  externalIntegrations: list,
  securityRequirements: list,
  risks: list,
  assumptions: list,
  missingInformation: list,
  questions: list,
  dependencies: list,
  implementationApproaches: list,
});

export const roadmapPhaseSchema = z.object({
  name: text,
  description: text,
  objective: text,
  estimatedDurationWeeks: z.number().min(0.5).max(104),
  tasks: list,
  dependencies: list,
  deliverables: list,
  risks: list,
  recommendedTools: list,
  acceptanceCriteria: list,
  checkpoints: list,
  completionRequirements: list,
  keyRecommendation: text,
  beginnerExplanation: text,
});

export const roadmapSchema = z.object({
  phases: z.array(roadmapPhaseSchema).min(1),
  features: z
    .array(z.object({ name: text, group: text, description: text, priority: prioritySchema.default("medium"), estimatedDays: z.number().min(1).max(365).default(30) }))
    .default([]),
});

export const recommendationsSchema = z.object({
  recommendations: z.array(z.object({ title: text, detail: text })).min(1).max(8),
});

export const advisorSchema = z.object({ answer: text, suggestedNextSteps: list });

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

export const auditSchema = z.object({
  summary: text,
  recommendations: z
    .array(z.object({ severity: severitySchema, description: text, whyItMatters: text, suggestedAction: text, related: z.string().default("") }))
    .default([]),
});

export const scopeImpactSchema = z.object({
  summary: text,
  affectedFeatures: list,
  newFeatures: z
    .array(z.object({ name: text, description: text, group: z.string().default(""), priority: prioritySchema.default("medium"), estimatedDays: z.number().min(1).max(365).default(21), dependencies: list }))
    .default([]),
  additionalDependencies: list,
  architecturalImplications: list,
  risks: list,
  testingImplications: list,
  deploymentImplications: list,
  scheduleImpactDays: z.number().min(0).max(1000).default(0),
  scheduleImpactNote: z.string().default(""),
});

export type AnalysisResult = z.infer<typeof analysisSchema>;
export type RoadmapResult = z.infer<typeof roadmapSchema>;
export type RecommendationsResult = z.infer<typeof recommendationsSchema>;
export type AdvisorResult = z.infer<typeof advisorSchema>;
export type AuditResult = z.infer<typeof auditSchema>;
export type ScopeImpactResult = z.infer<typeof scopeImpactSchema>;
export type ScopeNewFeature = ScopeImpactResult["newFeatures"][number];

export type AiAction = "analyze" | "roadmap" | "recommendations" | "advisor" | "audit" | "scope-change";
export type AiSource = "gemini" | "mock";

export interface AiEnvelope<T> {
  data: T;
  source: AiSource;
  /** Set when Gemini was expected but the mock answered instead. */
  warning?: string;
}
