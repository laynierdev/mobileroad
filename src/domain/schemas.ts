import { z } from "zod";

function isRealDate(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format yyyy-mm-dd")
  .refine(isRealDate, "That date does not exist");

export const featureStatusSchema = z.enum(["not_started", "design", "development", "qa", "uat", "staging", "production"]);
export const prioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const scheduleSchema = z.object({
  kickoff: isoDateSchema.optional(),
  design: isoDateSchema.optional(),
  dev: isoDateSchema.optional(),
  qa: isoDateSchema.optional(),
  uat: isoDateSchema.optional(),
  production: isoDateSchema.optional(),
});

export const checkpointSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  completed: z.boolean(),
  completedAt: z.string().optional(),
  acceptanceCriteria: z.array(z.string()),
});

export const featureSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  phaseId: z.string(),
  groupId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  status: featureStatusSchema,
  priority: prioritySchema,
  schedule: scheduleSchema,
  dependencies: z.array(z.string()),
  checkpoints: z.array(checkpointSchema),
  notes: z.string(),
  risk: z.object({ level: riskLevelSchema, description: z.string(), mitigation: z.string() }).optional(),
});

export const phaseSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  order: z.number(),
  description: z.string(),
  meaning: z.string(),
  whyItMatters: z.string(),
  whatYouDo: z.array(z.string()),
  successLooksLike: z.string(),
  commonMistakes: z.array(z.string()),
  whatsNext: z.string(),
  checkpoints: z.array(z.string()),
  deliverables: z.array(z.string()),
  technicalDetails: z.string(),
  featureStatus: featureStatusSchema.optional(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  platform: z.enum(["ios", "android", "both", "cross-platform"]),
  targetAudience: z.string(),
  businessGoals: z.array(z.string()),
  techStack: z.string(),
  targetLaunchDate: z.string(),
  isDemo: z.boolean(),
  teamSize: z.number().int().min(1).max(500).optional(),
  budget: z.string().max(80).optional(),
  experienceLevel: z.enum(["none", "some", "experienced"]).optional(),
  groups: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), order: z.number() })),
  phases: z.array(phaseSchema),
  features: z.array(featureSchema),
});

/** Fields a user may change from the feature editor. */
export const featurePatchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name must be 80 characters or fewer"),
  description: z.string().max(500, "Description must be 500 characters or fewer"),
  priority: prioritySchema,
  notes: z.string().max(2000, "Notes must be 2000 characters or fewer"),
  schedule: scheduleSchema,
  dependencies: z.array(z.string()),
});

export type FeaturePatch = z.infer<typeof featurePatchSchema>;
