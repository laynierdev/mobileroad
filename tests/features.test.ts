import { describe, expect, it } from "vitest";
import { changeStatus, toggleCheckpoint, updateFeatureDetails } from "@/domain/features";
import { projectSchema } from "@/domain/schemas";
import { buildDemoProject } from "@/data/demoProject";
import { FULL_SCHEDULE, makeFeature, makeProject, TODAY } from "./fixtures";

function unwrap<T>(r: { ok: true; value: T } | { ok: false; errors: string[] }): T {
  if (!r.ok) throw new Error(r.errors.join(" | "));
  return r.value;
}

describe("status transitions", () => {
  it("rejects moving forward while earlier checkpoints are incomplete", () => {
    const project = makeProject([makeFeature("a", "design")]);
    expect(changeStatus(project, "a", "development").ok).toBe(false);
  });

  it("advances through completed checkpoints and resets them when moving back", () => {
    let project = makeProject([makeFeature("a", "design")]);
    project = unwrap(toggleCheckpoint(project, "a", "cp0", TODAY));
    expect(project.features[0].status).toBe("development");
    project = unwrap(toggleCheckpoint(project, "a", "cp1", TODAY));
    expect(project.features[0].status).toBe("qa");
    project = unwrap(changeStatus(project, "a", "design"));
    expect(project.features[0].checkpoints.every((c) => !c.completed)).toBe(true);
  });

  it("does not let a not-started feature complete checkpoints", () => {
    expect(toggleCheckpoint(makeProject([makeFeature("a")]), "a", "cp0", TODAY).ok).toBe(false);
  });

  it("requires earlier checkpoints and un-completing cascades to later ones", () => {
    let project = makeProject([makeFeature("a", "qa")]);
    expect(toggleCheckpoint(project, "a", "cp3", TODAY).ok).toBe(false);
    project = unwrap(toggleCheckpoint(project, "a", "cp0", TODAY));
    expect(project.features[0].checkpoints.slice(0, 2).every((c) => !c.completed)).toBe(true);
    expect(project.features[0].status).toBe("design");
  });
});

describe("dependency-related behavior", () => {
  it("blocks production while a dependency is not in production", () => {
    const feature = makeFeature("a", "staging", { dependencies: ["dep"] });
    const project = makeProject([makeFeature("dep", "qa"), feature]);
    expect(changeStatus(project, "a", "production").ok).toBe(false);
    expect(toggleCheckpoint(project, "a", "cp4", TODAY).ok).toBe(false);
    const released = makeProject([makeFeature("dep", "production"), feature]);
    expect(changeStatus(released, "a", "production").ok).toBe(false); // last staging checkpoint still pending
    expect(unwrap(toggleCheckpoint(released, "a", "cp4", TODAY)).features[1].status).toBe("production");
  });

  it("rejects self, unknown and circular dependencies", () => {
    const base = { name: "A", description: "", priority: "medium", notes: "", schedule: FULL_SCHEDULE };
    const project = makeProject([makeFeature("a"), makeFeature("b", "not_started", { dependencies: ["a"] })]);
    expect(updateFeatureDetails(project, "a", { ...base, dependencies: ["a"] }).ok).toBe(false);
    expect(updateFeatureDetails(project, "a", { ...base, dependencies: ["zzz"] }).ok).toBe(false);
    expect(updateFeatureDetails(project, "a", { ...base, dependencies: ["b"] }).ok).toBe(false);
    expect(updateFeatureDetails(project, "b", { ...base, dependencies: ["a"] }).ok).toBe(true);
  });
});

describe("feature editing validation", () => {
  const base = { name: "Renamed", description: "d", priority: "high", notes: "n", dependencies: [] as string[] };
  const project = makeProject([makeFeature("a")]);

  it("accepts a valid edit", () => {
    const next = unwrap(updateFeatureDetails(project, "a", { ...base, schedule: FULL_SCHEDULE }));
    expect(next.features[0].name).toBe("Renamed");
    expect(next.features[0].priority).toBe("high");
  });

  it("rejects an empty name, invalid dates and out-of-order dates", () => {
    expect(updateFeatureDetails(project, "a", { ...base, name: "  ", schedule: FULL_SCHEDULE }).ok).toBe(false);
    expect(updateFeatureDetails(project, "a", { ...base, schedule: { kickoff: "2026-02-31" } }).ok).toBe(false);
    expect(updateFeatureDetails(project, "a", { ...base, schedule: { kickoff: "2026-06-10", design: "2026-06-01" } }).ok).toBe(false);
  });

  it("allows clearing dates", () => {
    const next = unwrap(updateFeatureDetails(project, "a", { ...base, schedule: {} }));
    expect(next.features[0].schedule).toEqual({});
  });

  it("does not modify the project when an edit is rejected", () => {
    const before = JSON.stringify(project);
    updateFeatureDetails(project, "a", { ...base, name: "", schedule: FULL_SCHEDULE });
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe("persistence schema", () => {
  it("round-trips the demo project through JSON and the Zod schema", () => {
    const demo = buildDemoProject(TODAY);
    expect(projectSchema.parse(JSON.parse(JSON.stringify(demo)))).toEqual(demo);
  });

  it("rejects corrupted data", () => {
    expect(projectSchema.safeParse({ id: 1 }).success).toBe(false);
  });
});
