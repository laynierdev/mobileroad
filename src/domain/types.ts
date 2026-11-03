export type FeatureStatus =
  | "not_started"
  | "design"
  | "development"
  | "qa"
  | "uat"
  | "staging"
  | "production";

export type ExperienceLevel = "none" | "some" | "experienced";
export type Priority = "low" | "medium" | "high" | "critical";
export type RiskLevel = "low" | "medium" | "high";

/** Stage boundaries of a feature; each one is rendered as a marker on the timeline. */
export type MarkerKey = "kickoff" | "design" | "dev" | "qa" | "uat" | "production";

export type Schedule = Partial<Record<MarkerKey, string>>;

export interface Checkpoint {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  completedAt?: string;
  acceptanceCriteria: string[];
}

export interface FeatureRisk {
  level: RiskLevel;
  description: string;
  mitigation: string;
}

export interface Feature {
  id: string;
  projectId: string;
  phaseId: string;
  groupId: string;
  name: string;
  description: string;
  status: FeatureStatus;
  priority: Priority;
  /** ISO dates (yyyy-mm-dd) for the markers on the timeline; any of them may be unset. */
  schedule: Schedule;
  dependencies: string[];
  checkpoints: Checkpoint[];
  notes: string;
  risk?: FeatureRisk;
}

export interface FeatureGroup {
  id: string;
  name: string;
  order: number;
}

export interface Phase {
  id: string;
  projectId: string;
  name: string;
  order: number;
  description: string;
  meaning: string;
  whyItMatters: string;
  whatYouDo: string[];
  successLooksLike: string;
  commonMistakes: string[];
  whatsNext: string;
  checkpoints: string[];
  deliverables: string[];
  technicalDetails: string;
  /** Feature status that belongs to this phase, when applicable. */
  featureStatus?: FeatureStatus;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  platform: "ios" | "android" | "both" | "cross-platform";
  targetAudience: string;
  businessGoals: string[];
  techStack: string;
  targetLaunchDate: string;
  isDemo: boolean;
  teamSize?: number;
  budget?: string;
  experienceLevel?: ExperienceLevel;
  groups: FeatureGroup[];
  phases: Phase[];
  features: Feature[];
}
