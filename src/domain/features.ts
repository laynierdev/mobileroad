import { MARKERS, STATUS_META, STATUS_ORDER } from "./status";
import { featurePatchSchema } from "./schemas";
import { addDays, toIso } from "./roadmap";
import { MARKER_ORDER, STAGE_CHECKPOINTS, STAGE_DAYS } from "./stages";
import type { Feature, FeatureStatus, Priority, Project, Schedule } from "./types";

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never,>(...errors: string[]): Result<T> => ({ ok: false, errors });

export const statusIndex = (status: FeatureStatus): number => STATUS_ORDER.indexOf(status);

/** Number of leading checkpoints that must be completed before a feature can hold this status. */
export function requiredCheckpoints(status: FeatureStatus): number {
  return Math.max(0, Math.min(statusIndex(status) - 1, 5));
}

/** Status a feature reaches once checkpoint `index` is completed. */
function statusAfterCheckpoint(index: number): FeatureStatus | null {
  return index <= 4 ? STATUS_ORDER[index + 2] : null;
}

function findFeature(project: Project, id: string): Feature | undefined {
  return project.features.find((f) => f.id === id);
}

function replaceFeature(project: Project, next: Feature): Project {
  return { ...project, features: project.features.map((f) => (f.id === next.id ? next : f)) };
}

function blockingDependencies(project: Project, feature: Feature, target: FeatureStatus): Feature[] {
  if (target !== "production") return [];
  return feature.dependencies
    .map((id) => findFeature(project, id))
    .filter((d): d is Feature => d !== undefined && d.status !== "production");
}

export function changeStatus(project: Project, featureId: string, target: FeatureStatus): Result<Project> {
  const feature = findFeature(project, featureId);
  if (!feature) return fail("Feature not found.");
  if (feature.status === target) return ok(project);

  if (statusIndex(target) > statusIndex(feature.status)) {
    const missing = feature.checkpoints.slice(0, requiredCheckpoints(target)).filter((c) => !c.completed);
    if (missing.length > 0) {
      return fail(`Complete these checkpoints before moving to "${STATUS_META[target].label}": ${missing.map((c) => c.name).join("; ")}.`);
    }
    const blockers = blockingDependencies(project, feature, target);
    if (blockers.length > 0) {
      return fail(`Cannot go to production while dependencies are not in production: ${blockers.map((d) => d.name).join(", ")}.`);
    }
    return ok(replaceFeature(project, { ...feature, status: target }));
  }

  const keep = requiredCheckpoints(target);
  const checkpoints = feature.checkpoints.map((c, i) => (i < keep || !c.completed ? c : { ...c, completed: false, completedAt: undefined }));
  return ok(replaceFeature(project, { ...feature, status: target, checkpoints }));
}

export function toggleCheckpoint(project: Project, featureId: string, checkpointId: string, now: Date = new Date()): Result<Project> {
  const feature = findFeature(project, featureId);
  if (!feature) return fail("Feature not found.");
  const index = feature.checkpoints.findIndex((c) => c.id === checkpointId);
  if (index < 0) return fail("Checkpoint not found.");
  const current = statusIndex(feature.status);

  if (!feature.checkpoints[index].completed) {
    if (current === 0) return fail("Start the feature (move it out of Not Started) before completing checkpoints.");
    if (current < index + 1) return fail("This checkpoint belongs to a later stage.");
    const earlier = feature.checkpoints.slice(0, index).filter((c) => !c.completed);
    if (earlier.length > 0) return fail(`Complete earlier checkpoints first: ${earlier.map((c) => c.name).join("; ")}.`);

    const advanced = statusAfterCheckpoint(index);
    const status = advanced && statusIndex(advanced) > current ? advanced : feature.status;
    const blockers = blockingDependencies(project, feature, status);
    if (blockers.length > 0) {
      return fail(`Cannot go to production while dependencies are not in production: ${blockers.map((d) => d.name).join(", ")}.`);
    }
    const checkpoints = feature.checkpoints.map((c, i) => (i === index ? { ...c, completed: true, completedAt: toIso(now) } : c));
    return ok(replaceFeature(project, { ...feature, status, checkpoints }));
  }

  const checkpoints = feature.checkpoints.map((c, i) => (i >= index && c.completed ? { ...c, completed: false, completedAt: undefined } : c));
  const status = index <= 4 && current > index + 1 ? STATUS_ORDER[index + 1] : feature.status;
  return ok(replaceFeature(project, { ...feature, status, checkpoints }));
}

function dependsOn(project: Project, fromId: string, targetId: string, seen = new Set<string>()): boolean {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  const from = findFeature(project, fromId);
  return from ? from.dependencies.some((d) => dependsOn(project, d, targetId, seen)) : false;
}

export function updateFeatureDetails(project: Project, featureId: string, input: unknown): Result<Project> {
  const feature = findFeature(project, featureId);
  if (!feature) return fail("Feature not found.");

  const parsed = featurePatchSchema.safeParse(input);
  if (!parsed.success) {
    return fail(...parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)));
  }
  const patch = parsed.data;
  const errors: string[] = [];

  let previous: { title: string; date: string } | null = null;
  for (const marker of MARKERS) {
    const date = patch.schedule[marker.key];
    if (!date) continue;
    if (previous && date < previous.date) errors.push(`"${marker.title}" cannot be before "${previous.title}".`);
    previous = { title: marker.title, date };
  }

  const unique = [...new Set(patch.dependencies)];
  for (const depId of unique) {
    if (depId === featureId) errors.push("A feature cannot depend on itself.");
    else if (!findFeature(project, depId)) errors.push(`Unknown dependency: ${depId}.`);
    else if (dependsOn(project, depId, featureId)) {
      errors.push(`Adding "${findFeature(project, depId)?.name}" would create a circular dependency.`);
    }
  }
  if (errors.length > 0) return fail(...errors);

  const schedule = Object.fromEntries(Object.entries(patch.schedule).filter(([, v]) => v));
  return ok(replaceFeature(project, { ...feature, name: patch.name, description: patch.description, priority: patch.priority, notes: patch.notes, schedule, dependencies: unique }));
}

export interface NewFeatureInput {
  name: string;
  description: string;
  groupId: string;
  priority: Priority;
  estimatedDays: number;
  dependencies: string[];
}

function uniqueId(project: Project, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "feature";
  let id = base;
  for (let n = 2; project.features.some((f) => f.id === id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Builds a not-started feature whose stage dates are spread over `estimatedDays` from `start`. */
export function createFeature(project: Project, input: NewFeatureInput, start: Date): Feature {
  const id = uniqueId(project, input.name);
  const total = STAGE_DAYS.reduce((a, b) => a + b, 0);
  const schedule: Schedule = { kickoff: toIso(start) };
  let cursor = start;
  STAGE_DAYS.forEach((days, i) => {
    cursor = addDays(cursor, Math.max(2, Math.round((input.estimatedDays * days) / total)));
    schedule[MARKER_ORDER[i + 1]] = toIso(cursor);
  });
  const groupId = project.groups.some((g) => g.id === input.groupId) ? input.groupId : project.groups[0]?.id ?? input.groupId;
  return {
    id,
    projectId: project.id,
    phaseId: "phase-not_started",
    groupId,
    name: input.name,
    description: input.description,
    status: "not_started",
    priority: input.priority,
    schedule,
    dependencies: input.dependencies.filter((d) => project.features.some((f) => f.id === d)),
    checkpoints: STAGE_CHECKPOINTS.map((c, i) => ({ id: `${id}-cp${i}`, name: c.name, description: c.description, completed: false, acceptanceCriteria: c.criteria })),
    notes: "",
  };
}

/** Adds only the features the user accepted from a scope-change review. Existing features are untouched. */
export function applyScopeChange(project: Project, accepted: NewFeatureInput[], start: Date): Result<Project> {
  if (accepted.length === 0) return fail("Select at least one change to apply.");
  const features = [...project.features];
  let working = project;
  for (const input of accepted) {
    const feature = createFeature(working, input, start);
    features.push(feature);
    working = { ...project, features: [...features] };
  }
  return ok(working);
}
