import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, backupFileName, createBackup, parseBackup, planImport, resolveImport } from "@/domain/backup";
import { buildDemoProject } from "@/data/demoProject";
import { makeFeature, makeProject, TODAY } from "./fixtures";

const demo = buildDemoProject(TODAY);
const alpha = { ...makeProject([makeFeature("a")]), id: "alpha", name: "Alpha" };
const beta = { ...makeProject([makeFeature("b")]), id: "beta", name: "Beta" };

describe("backup file", () => {
  it("round-trips projects through JSON with a version and date", () => {
    const backup = createBackup([demo, alpha], TODAY);
    expect(backup).toMatchObject({ app: "mobileroad", version: BACKUP_VERSION });
    const result = parseBackup(JSON.stringify(backup));
    if (!result.ok) throw new Error(result.error);
    expect(result.value.projects).toEqual([demo, alpha]);
    expect(result.value.invalid).toEqual([]);
    expect(backupFileName(TODAY)).toBe("mobileroad-backup-2026-06-15.json");
  });

  it.each([
    ["not JSON", "{oops", "not valid JSON"],
    ["a different app's file", JSON.stringify({ app: "other", version: 1, projects: [] }), "not a MobileRoad backup"],
    ["an array", "[]", "not a MobileRoad backup"],
    ["a newer version", JSON.stringify({ app: "mobileroad", version: 99, projects: [] }), "newer version"],
    ["missing projects", JSON.stringify({ app: "mobileroad", version: 1 }), "damaged"],
    ["no projects", JSON.stringify({ app: "mobileroad", version: 1, projects: [] }), "does not contain any projects"],
  ])("rejects %s with a clear message", (_name, text, expected) => {
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(expected);
  });

  it("imports the valid projects and reports the invalid ones instead of dropping them silently", () => {
    const text = JSON.stringify({ app: "mobileroad", version: 1, projects: [alpha, { id: "broken", name: "Broken", features: "nope" }, 42] });
    const result = parseBackup(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.projects.map((p) => p.id)).toEqual(["alpha"]);
    expect(result.value.invalid).toHaveLength(2);
    expect(result.value.invalid[0].name).toBe("Broken");
    expect(result.value.invalid[1].name).toBe("Project #3");
  });
});

describe("import conflicts", () => {
  it("flags projects whose id already exists", () => {
    expect(planImport(["alpha"], [alpha, beta]).map((p) => p.conflict)).toEqual([true, false]);
  });

  it("adds non-conflicting projects untouched", () => {
    const r = resolveImport(["alpha"], [beta], {});
    expect(r.toSave).toEqual([beta]);
    expect(r.copied).toEqual([]);
  });

  it("replaces, copies or skips according to the decision", () => {
    expect(resolveImport(["alpha"], [alpha], { alpha: "replace" })).toMatchObject({ toSave: [alpha], replaced: ["Alpha"] });
    expect(resolveImport(["alpha"], [alpha], { alpha: "skip" })).toMatchObject({ toSave: [], skipped: ["Alpha"] });
  });

  it("defaults to keeping both, with a new id and consistent child references", () => {
    const withPhase = { ...alpha, phases: [{ ...buildDemoProject(TODAY).phases[0], projectId: "alpha" }] };
    const r = resolveImport(["alpha", "alpha-copy"], [withPhase], {});
    const copy = r.toSave[0];
    expect(copy.id).toBe("alpha-copy-2");
    expect(copy.name).toBe("Alpha (imported)");
    expect(copy.features.every((f) => f.projectId === copy.id)).toBe(true);
    expect(copy.phases.every((p) => p.projectId === copy.id)).toBe(true);
    expect(r.copied).toEqual(["Alpha"]);
  });
});
