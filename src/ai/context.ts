import { countAtRisk, countByStatus, isAtRisk, isOverdue, productionPercent, toIso } from "@/domain/roadmap";
import type { Project } from "@/domain/types";

/** Compact, deterministic description of the project that is sent to the model. */
export function projectContext(project: Project, today: Date) {
  const features = project.features;
  return {
    today: toIso(today),
    project: {
      name: project.name,
      description: project.description,
      platform: project.platform,
      targetAudience: project.targetAudience,
      businessGoals: project.businessGoals,
      techStack: project.techStack,
      targetLaunchDate: project.targetLaunchDate,
    },
    metrics: {
      totalFeatures: features.length,
      statusCounts: countByStatus(features),
      productionPercent: productionPercent(features),
      atRisk: countAtRisk(features, today),
    },
    groups: project.groups.map((g) => ({ id: g.id, name: g.name })),
    features: features.map((f) => ({
      id: f.id,
      name: f.name,
      group: f.groupId,
      status: f.status,
      priority: f.priority,
      schedule: f.schedule,
      dependsOn: f.dependencies,
      checkpointsDone: `${f.checkpoints.filter((c) => c.completed).length}/${f.checkpoints.length}`,
      atRisk: isAtRisk(f, today),
      overdue: isOverdue(f, today),
      risk: f.risk?.description,
    })),
  };
}
