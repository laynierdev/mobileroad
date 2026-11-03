import { z } from "zod";
import { projectSchema } from "./schemas";
import type { Project } from "./types";

export const BACKUP_APP = "mobileroad";
/** Bump when the file layout changes and add a step to `migrateBackup`. */
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  projects: Project[];
}

export function createBackup(projects: Project[], now: Date = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), projects };
}

export function backupFileName(now: Date = new Date()): string {
  return `mobileroad-backup-${now.toISOString().slice(0, 10)}.json`;
}

const envelopeSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number().int().min(1),
  exportedAt: z.string().optional(),
  projects: z.array(z.unknown()),
});

export interface ParsedBackup {
  projects: Project[];
  /** Entries that could not be read, with the reason, so nothing disappears silently. */
  invalid: { position: number; name: string; reason: string }[];
  version: number;
  exportedAt?: string;
}

export type BackupResult = { ok: true; value: ParsedBackup } | { ok: false; error: string };

/** Upgrades older file layouts to the current one. Version 1 is the first, so nothing to do yet. */
function migrateBackup(raw: { version: number; projects: unknown[] }): unknown[] {
  return raw.projects;
}

export function parseBackup(text: string): BackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON. Choose a backup exported from MobileRoad." };
  }
  if (typeof json !== "object" || json === null || (json as { app?: unknown }).app !== BACKUP_APP) {
    return { ok: false, error: "This file is not a MobileRoad backup." };
  }
  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) return { ok: false, error: "This backup file is damaged or incomplete." };
  if (envelope.data.version > BACKUP_VERSION) {
    return { ok: false, error: `This backup was created by a newer version of MobileRoad (file version ${envelope.data.version}). Update the app to import it.` };
  }

  const projects: Project[] = [];
  const invalid: ParsedBackup["invalid"] = [];
  migrateBackup({ version: envelope.data.version, projects: envelope.data.projects }).forEach((entry, position) => {
    const parsed = projectSchema.safeParse(entry);
    if (parsed.success) projects.push(parsed.data);
    else {
      const name = typeof (entry as { name?: unknown })?.name === "string" ? (entry as { name: string }).name : `Project #${position + 1}`;
      const issue = parsed.error.issues[0];
      invalid.push({ position, name, reason: `${issue?.path.join(".") || "project"}: ${issue?.message ?? "invalid"}` });
    }
  });
  if (projects.length === 0 && invalid.length === 0) return { ok: false, error: "The backup does not contain any projects." };
  return { ok: true, value: { projects, invalid, version: envelope.data.version, exportedAt: envelope.data.exportedAt } };
}

export type ImportDecision = "replace" | "copy" | "skip";

export interface ImportPlanItem {
  project: Project;
  conflict: boolean;
}

/** Marks which incoming projects already exist in the browser (same id). */
export function planImport(existingIds: string[], incoming: Project[]): ImportPlanItem[] {
  const known = new Set(existingIds);
  return incoming.map((project) => ({ project, conflict: known.has(project.id) }));
}

function uniqueCopyId(base: string, taken: Set<string>): string {
  let n = 1;
  let id = `${base}-copy`;
  while (taken.has(id)) id = `${base}-copy-${(n += 1)}`;
  return id;
}

/** Applies the user's decision for each conflicting project. Non-conflicting projects are always added. */
export function resolveImport(
  existingIds: string[],
  incoming: Project[],
  decisions: Record<string, ImportDecision>,
): { toSave: Project[]; replaced: string[]; copied: string[]; skipped: string[] } {
  const taken = new Set([...existingIds, ...incoming.map((p) => p.id)]);
  const known = new Set(existingIds);
  const result = { toSave: [] as Project[], replaced: [] as string[], copied: [] as string[], skipped: [] as string[] };

  for (const project of incoming) {
    if (!known.has(project.id)) {
      result.toSave.push(project);
      continue;
    }
    const decision = decisions[project.id] ?? "copy";
    if (decision === "skip") result.skipped.push(project.name);
    else if (decision === "replace") {
      result.toSave.push(project);
      result.replaced.push(project.name);
    } else {
      const id = uniqueCopyId(project.id, taken);
      taken.add(id);
      result.toSave.push({
        ...project,
        id,
        name: `${project.name} (imported)`,
        phases: project.phases.map((ph) => ({ ...ph, projectId: id })),
        features: project.features.map((f) => ({ ...f, projectId: id })),
      });
      result.copied.push(project.name);
    }
  }
  return result;
}
