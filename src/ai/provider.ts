import type { Project } from "@/domain/types";
import type {
  AdvisorResult,
  AnalysisResult,
  AuditResult,
  RecommendationsResult,
  RoadmapResult,
  ScopeImpactResult,
} from "./schemas";

export interface AdvisorTurn {
  role: "user" | "assistant";
  content: string;
}

/** Everything the app needs from an AI backend. Add another provider by implementing this. */
export interface AiProvider {
  readonly name: "gemini" | "mock";
  analyzeRequirements(input: { text: string; projectName?: string }): Promise<AnalysisResult>;
  generateRoadmap(input: { brief: string; projectName?: string; platform?: string; teamSize?: number }): Promise<RoadmapResult>;
  generateRecommendations(project: Project, featureId: string, today: Date): Promise<RecommendationsResult>;
  answerQuestion(project: Project, question: string, history: AdvisorTurn[], today: Date): Promise<AdvisorResult>;
  auditProject(project: Project, today: Date): Promise<AuditResult>;
  analyzeScopeChange(project: Project, change: string, today: Date): Promise<ScopeImpactResult>;
}
