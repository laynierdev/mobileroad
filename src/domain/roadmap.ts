import { MARKERS, STATUS_ORDER } from "./status";
import type { Feature, FeatureStatus, MarkerKey, Project } from "./types";

const DAY_MS = 86_400_000;

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export type StatusCounts = Record<FeatureStatus, number>;

export function countByStatus(features: Feature[]): StatusCounts {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as StatusCounts;
  for (const f of features) counts[f.status] += 1;
  return counts;
}

/** Share of features that are live in production, as a whole percentage. */
export function productionPercent(features: Feature[]): number {
  if (features.length === 0) return 0;
  return Math.round((countByStatus(features).production / features.length) * 100);
}

/** A feature is overdue when the next marker it has to reach is dated before today. */
export function isOverdue(feature: Feature, today: Date): boolean {
  const next = MARKERS[STATUS_ORDER.indexOf(feature.status)];
  if (!next) return false;
  const date = feature.schedule[next.key];
  return date !== undefined && date < toIso(today);
}

export function isAtRisk(feature: Feature, today: Date): boolean {
  return (feature.risk !== undefined && feature.risk.level !== "low") || isOverdue(feature, today);
}

export function countAtRisk(features: Feature[], today: Date): number {
  return features.filter((f) => isAtRisk(f, today)).length;
}

/** Markers that have a date, in lifecycle order. */
export function scheduledMarkers(feature: Feature): { index: number; key: MarkerKey; date: string }[] {
  return MARKERS.flatMap((m, index) => {
    const date = feature.schedule[m.key];
    return date ? [{ index, key: m.key, date }] : [];
  });
}

export type ProjectHealth = "healthy" | "attention" | "critical";

export function projectHealth(features: Feature[], today: Date): ProjectHealth {
  if (features.length === 0) return "healthy";
  const ratio = countAtRisk(features, today) / features.length;
  if (ratio > 0.2) return "critical";
  return ratio > 0 ? "attention" : "healthy";
}

export interface MilestoneCard {
  key: MarkerKey;
  code: string;
  title: string;
  subtitle: string;
  color: string;
  date: string | null;
  featureName: string | null;
  completed: boolean;
  warning: boolean;
}

/** For every marker type: the next upcoming date across features (or the last one when all are behind us). */
export function deriveMilestones(features: Feature[], today: Date): MilestoneCard[] {
  const todayIso = toIso(today);
  return MARKERS.map((marker) => {
    const entries = features
      .flatMap((f) => {
        const date = f.schedule[marker.key];
        return date ? [{ feature: f, date }] : [];
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = entries.find((e) => e.date >= todayIso);
    const pick = upcoming ?? entries[entries.length - 1];
    return {
      key: marker.key,
      code: marker.code,
      title: marker.title,
      subtitle: marker.subtitle,
      color: marker.color,
      date: pick?.date ?? null,
      featureName: pick?.feature.name ?? null,
      completed: !upcoming && entries.length > 0,
      warning: pick ? isAtRisk(pick.feature, today) : false,
    };
  });
}

export interface TimelineRange {
  months: { label: string; year: number; month: number; start: Date; days: number }[];
  start: Date;
}

export function buildTimelineRange(features: Feature[], today: Date, minMonths = 12): TimelineRange {
  const dates = features.flatMap((f) => scheduledMarkers(f).map((m) => parseDate(m.date)));
  dates.push(today);
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const first = new Date(min.getFullYear(), min.getMonth(), 1);
  const months: TimelineRange["months"] = [];
  let cursor = first;
  while (cursor <= max || months.length < minMonths) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    months.push({
      label: cursor.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      year: cursor.getFullYear(),
      month: cursor.getMonth(),
      start: cursor,
      days: diffDays(next, cursor),
    });
    cursor = next;
  }
  return { months, start: first };
}

/** Horizontal position (px) of a date on the timeline, interpolating inside each month. */
export function dateToX(range: TimelineRange, monthWidth: number, value: string | Date): number {
  const date = typeof value === "string" ? parseDate(value) : value;
  let x = 0;
  for (const m of range.months) {
    const end = new Date(m.year, m.month + 1, 1);
    if (date < end) {
      return x + (Math.max(0, diffDays(date, m.start)) / m.days) * monthWidth;
    }
    x += monthWidth;
  }
  return x;
}

export interface FeatureGroupView {
  id: string;
  name: string;
  features: Feature[];
  atRisk: number;
}

export function groupFeatures(project: Project, features: Feature[], today: Date): FeatureGroupView[] {
  return [...project.groups]
    .sort((a, b) => a.order - b.order)
    .map((g) => {
      const items = features.filter((f) => f.groupId === g.id);
      return { id: g.id, name: g.name, features: items, atRisk: countAtRisk(items, today) };
    })
    .filter((g) => g.features.length > 0);
}
