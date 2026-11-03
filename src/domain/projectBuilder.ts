import type { RoadmapResult } from "@/ai/schemas";
import { createFeature } from "./features";
import { addDays, toIso } from "./roadmap";
import type { ExperienceLevel, FeatureStatus, Phase, Project } from "./types";

export interface ProjectDetails {
  name: string;
  description: string;
  targetAudience: string;
  businessGoals: string[];
  platform: Project["platform"];
  techStack: string;
  teamSize?: number;
  budget?: string;
  experienceLevel?: ExperienceLevel;
  targetLaunchDate?: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "item";

const PHASE_STATUS: [RegExp, FeatureStatus][] = [
  [/design|ux|ui/i, "design"],
  [/develop|build|implement/i, "development"],
  [/qa|quality|test/i, "qa"],
  [/uat|acceptance/i, "uat"],
  [/staging/i, "staging"],
  [/production|launch|release|publish/i, "production"],
];

function toPhases(projectId: string, roadmap: RoadmapResult): Phase[] {
  return roadmap.phases.map((p, i) => {
    const next = roadmap.phases[i + 1];
    return {
      id: `phase-${slug(p.name)}`,
      projectId,
      name: p.name,
      order: i + 1,
      description: p.description,
      meaning: p.beginnerExplanation,
      whyItMatters: p.objective,
      whatYouDo: p.tasks,
      successLooksLike: p.acceptanceCriteria.join(". ") || p.objective,
      commonMistakes: p.risks,
      whatsNext: next ? `Next: ${next.name}.` : "Ongoing: keep monitoring and improving.",
      checkpoints: p.checkpoints,
      deliverables: p.deliverables,
      technicalDetails: [p.recommendedTools.length ? `Recommended tools: ${p.recommendedTools.join(", ")}.` : "", p.keyRecommendation, ...p.completionRequirements].filter(Boolean).join(" "),
      featureStatus: PHASE_STATUS.find(([re]) => re.test(p.name))?.[1],
    };
  });
}

/** Turns a reviewed roadmap into a new project: every feature starts "Not Started" with staggered dates. */
export function buildProjectFromRoadmap(details: ProjectDetails, roadmap: RoadmapResult, start: Date, id: string = `project-${Date.now().toString(36)}`): Project {
  const groupNames = [...new Set(roadmap.features.map((f) => f.group.trim() || "General"))];
  const groups = groupNames.map((name, order) => ({ id: slug(name), name, order: order + 1 }));
  const leadWeeks = roadmap.phases.filter((p) => /discovery|architecture/i.test(p.name)).reduce((sum, p) => sum + p.estimatedDurationWeeks, 0);
  const firstStart = addDays(start, Math.min(120, Math.round(leadWeeks * 7)));

  let project: Project = {
    id,
    name: details.name.trim(),
    description: details.description,
    platform: details.platform,
    targetAudience: details.targetAudience,
    businessGoals: details.businessGoals,
    techStack: details.techStack,
    targetLaunchDate: details.targetLaunchDate ?? "",
    isDemo: false,
    teamSize: details.teamSize,
    budget: details.budget,
    experienceLevel: details.experienceLevel,
    groups,
    phases: toPhases(id, roadmap),
    features: [],
  };

  roadmap.features.forEach((f, i) => {
    const offset = (i % 6) * 7 + Math.floor(i / 6) * 14;
    const feature = createFeature(
      project,
      { name: f.name, description: f.description, groupId: slug(f.group.trim() || "General"), priority: f.priority, estimatedDays: f.estimatedDays, dependencies: [] },
      addDays(firstStart, offset),
    );
    project = { ...project, features: [...project.features, feature] };
  });

  if (!project.targetLaunchDate) {
    const last = project.features.map((f) => f.schedule.production).filter((d): d is string => !!d).sort().pop();
    project = { ...project, targetLaunchDate: last ?? toIso(addDays(start, 180)) };
  }
  return project;
}
