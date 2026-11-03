import type { Checkpoint, Feature, FeatureStatus, Project, Schedule } from "@/domain/types";
import { STATUS_ORDER } from "@/domain/status";

export const TODAY = new Date(2026, 5, 15); // 15 Jun 2026

export const FULL_SCHEDULE: Schedule = {
  kickoff: "2026-06-01",
  design: "2026-06-10",
  dev: "2026-07-10",
  qa: "2026-07-20",
  uat: "2026-07-27",
  production: "2026-08-03",
};

export function checkpointsFor(status: FeatureStatus): Checkpoint[] {
  const idx = STATUS_ORDER.indexOf(status);
  return Array.from({ length: 6 }, (_, i) => ({
    id: `cp${i}`,
    name: `Checkpoint ${i}`,
    description: "",
    completed: status === "production" || i < idx - 1,
    acceptanceCriteria: [],
  }));
}

export function makeFeature(id: string, status: FeatureStatus = "not_started", extra: Partial<Feature> = {}): Feature {
  return {
    id,
    projectId: "p",
    phaseId: "ph",
    groupId: "g",
    name: id,
    description: "",
    status,
    priority: "medium",
    schedule: { ...FULL_SCHEDULE },
    dependencies: [],
    checkpoints: checkpointsFor(status),
    notes: "",
    ...extra,
  };
}

export function makeProject(features: Feature[]): Project {
  return {
    id: "p",
    name: "Test",
    description: "",
    platform: "both",
    targetAudience: "",
    businessGoals: [],
    techStack: "",
    targetLaunchDate: "2026-12-01",
    isDemo: false,
    groups: [{ id: "g", name: "Group", order: 1 }],
    phases: [],
    features,
  };
}
