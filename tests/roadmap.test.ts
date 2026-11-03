import { describe, expect, it } from "vitest";
import { buildTimelineRange, countAtRisk, countByStatus, deriveMilestones, isOverdue, productionPercent, projectHealth } from "@/domain/roadmap";
import { STATUS_ORDER } from "@/domain/status";
import { buildDemoProject } from "@/data/demoProject";
import { makeFeature, TODAY } from "./fixtures";

describe("progress calculations", () => {
  it("handles an empty project", () => {
    expect(productionPercent([])).toBe(0);
    expect(countByStatus([])).toEqual(Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])));
    expect(projectHealth([], TODAY)).toBe("healthy");
    expect(deriveMilestones([], TODAY).every((m) => m.date === null)).toBe(true);
  });

  it("is 0% when no feature is completed", () => {
    expect(productionPercent([makeFeature("a"), makeFeature("b", "development")])).toBe(0);
  });

  it("is 100% when every feature is in production", () => {
    expect(productionPercent([makeFeature("a", "production"), makeFeature("b", "production")])).toBe(100);
  });

  it("counts mixed statuses and computes 10 of 50 as 20%", () => {
    const features = [
      ...Array.from({ length: 10 }, (_, i) => makeFeature(`p${i}`, "production")),
      ...Array.from({ length: 30 }, (_, i) => makeFeature(`n${i}`)),
      ...Array.from({ length: 10 }, (_, i) => makeFeature(`d${i}`, "development")),
    ];
    expect(features).toHaveLength(50);
    expect(productionPercent(features)).toBe(20);
    const counts = countByStatus(features);
    expect(counts.production).toBe(10);
    expect(counts.not_started).toBe(30);
    expect(counts.development).toBe(10);
  });

  it("tolerates features without dates", () => {
    const f = makeFeature("a", "design", { schedule: {} });
    expect(isOverdue(f, TODAY)).toBe(false);
    expect(deriveMilestones([f], TODAY).every((m) => m.date === null)).toBe(true);
    expect(buildTimelineRange([f], TODAY).months.length).toBeGreaterThanOrEqual(12);
  });
});

describe("risk and milestones", () => {
  it("flags overdue features and explicit risks", () => {
    const overdue = makeFeature("late", "design", { schedule: { kickoff: "2026-05-01", design: "2026-06-01" } });
    const risky = makeFeature("risky", "development", { risk: { level: "high", description: "x", mitigation: "y" } });
    const lowRisk = makeFeature("fine", "development", { risk: { level: "low", description: "x", mitigation: "y" } });
    expect(isOverdue(overdue, TODAY)).toBe(true);
    expect(countAtRisk([overdue, risky, lowRisk], TODAY)).toBe(2);
  });

  it("derives the next milestone from the features' dates", () => {
    const a = makeFeature("a", "design", { schedule: { kickoff: "2026-06-01", design: "2026-06-20", dev: "2026-07-01", qa: "2026-07-10", uat: "2026-07-15", production: "2026-07-20" } });
    const b = makeFeature("b", "design", { schedule: { kickoff: "2026-06-01", design: "2026-06-18", dev: "2026-07-05", qa: "2026-07-12", uat: "2026-07-16", production: "2026-07-25" } });
    const milestones = deriveMilestones([a, b], TODAY);
    const design = milestones.find((m) => m.key === "design");
    expect(design?.date).toBe("2026-06-18");
    expect(design?.featureName).toBe("b");
    expect(design?.completed).toBe(false);
    expect(milestones.find((m) => m.key === "kickoff")?.completed).toBe(true);
  });

  it("builds a demo project whose counts match the dashboard", () => {
    const demo = buildDemoProject(TODAY);
    const counts = countByStatus(demo.features);
    expect(demo.features).toHaveLength(46);
    expect(counts).toMatchObject({ not_started: 24, design: 4, development: 6, qa: 4, uat: 2, staging: 3, production: 3 });
    expect(productionPercent(demo.features)).toBe(7);
    expect(countAtRisk(demo.features, TODAY)).toBe(4);
  });
});
