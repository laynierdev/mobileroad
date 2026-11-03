"use client";

import { useEffect, useMemo, useRef } from "react";
import { StatusBadge } from "./StatusBadge";
import { dateToX, formatShortDate, isAtRisk, scheduledMarkers, type FeatureGroupView, type TimelineRange } from "@/domain/roadmap";
import { MARKERS, SEGMENT_COLORS, STATUS_META, STATUS_ORDER } from "@/domain/status";
import type { Feature } from "@/domain/types";

const MONTH_W = 130;
const MIN_LABEL_GAP = 38;

interface Props {
  range: TimelineRange;
  groups: FeatureGroupView[];
  today: Date;
  collapsed: Set<string>;
  onToggleGroup: (id: string) => void;
  onOpenFeature: (id: string) => void;
}

export function Timeline({ range, groups, today, collapsed, onToggleGroup, onOpenFeature }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackWidth = range.months.length * MONTH_W;
  const todayX = dateToX(range, MONTH_W, today);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, todayX - 160);
  }, [todayX]);

  return (
    <div className="tl-scroll" ref={scrollRef} role="region" aria-label="Feature timeline">
      <div className="tl-inner" style={{ width: `calc(var(--label-w) + ${trackWidth}px)` }}>
        <div className="tl-head">
          <div className="tl-head-label">FEATURE</div>
          {range.months.map((m) => (
            <div key={m.label} className="tl-month" style={{ width: MONTH_W }}>{m.label}</div>
          ))}
        </div>
        <div className="tl-today-line" style={{ left: `calc(var(--label-w) + ${todayX}px)` }} aria-hidden="true" />
        <div className="tl-today-tip" style={{ left: `calc(var(--label-w) + ${todayX}px)` }} aria-hidden="true" title="Today" />

        {groups.length === 0 && (
          <div className="p-4 text-muted" style={{ position: "sticky", left: 0 }}>No features match the current filter.</div>
        )}

        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.id);
          return (
            <section key={group.id}>
              <button
                type="button"
                className="tl-group"
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={!isCollapsed}
                aria-controls={`group-${group.id}`}
              >
                <span className="tl-group-in">
                  <i className={`bi ${isCollapsed ? "bi-chevron-right" : "bi-chevron-down"}`} aria-hidden="true" />
                  <span>{group.name}</span>
                  <span className="count">
                    {group.features.length} items
                    {group.atRisk > 0 && <span className="risk"> ({group.atRisk} at risk)</span>}
                  </span>
                </span>
              </button>
              {!isCollapsed && (
                <div id={`group-${group.id}`}>
                  {group.features.map((feature) => (
                    <TimelineRow key={feature.id} feature={feature} range={range} trackWidth={trackWidth} today={today} onOpen={onOpenFeature} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimelineRow({ feature, range, trackWidth, today, onOpen }: { feature: Feature; range: TimelineRange; trackWidth: number; today: Date; onOpen: (id: string) => void }) {
  const meta = STATUS_META[feature.status];
  const statusIndex = STATUS_ORDER.indexOf(feature.status);
  const points = useMemo(
    () => scheduledMarkers(feature).map((m) => ({ marker: MARKERS[m.index], index: m.index, x: dateToX(range, MONTH_W, m.date), date: m.date })),
    [feature, range],
  );
  const labelled = new Set<number>();
  let lastLabelX = -Infinity;
  for (const p of points) {
    if (p.x - lastLabelX >= MIN_LABEL_GAP) {
      labelled.add(p.index);
      lastLabelX = p.x;
    }
  }
  const risk = isAtRisk(feature, today);

  return (
    <div
      className="tl-row"
      role="button"
      tabIndex={0}
      aria-label={`${feature.name}, ${meta.label}. Open details`}
      onClick={() => onOpen(feature.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(feature.id);
        }
      }}
    >
      <div className="tl-label" style={{ ["--c" as string]: meta.color }}>
        {risk && <i className="bi bi-exclamation-triangle-fill tl-ico risk" title={feature.risk?.description ?? "A milestone date has passed"} aria-label="At risk" />}
        <span className="tl-name" title={feature.name}>{feature.name}</span>
        {feature.dependencies.length > 0 && (
          <i className="bi bi-info-circle-fill tl-ico dep" title={`${feature.dependencies.length} dependencies`} aria-label={`${feature.dependencies.length} dependencies`} />
        )}
        {(feature.priority === "high" || feature.priority === "critical") && (
          <i className="bi bi-arrow-up-square-fill tl-ico prio" title={`${feature.priority} priority`} aria-label={`${feature.priority} priority`} />
        )}
        <StatusBadge status={feature.status} />
      </div>
      <div className="tl-track" style={{ width: trackWidth, ["--mw" as string]: `${MONTH_W}px` }}>
        {points.slice(0, -1).map((p, i) => {
          const next = points[i + 1];
          const reached = statusIndex > p.index + 1;
          const active = statusIndex === p.index + 1;
          return (
            <div
              key={p.marker.key}
              className="tl-seg"
              style={{
                left: p.x,
                width: Math.max(0, next.x - p.x),
                background: SEGMENT_COLORS[p.index],
                opacity: reached ? 0.55 : active ? 0.85 : 0.22,
              }}
            />
          );
        })}
        {points.length === 0 && <span className="tl-unscheduled">No dates scheduled</span>}
        {points.map((p) => {
          const passed = statusIndex > p.index;
          return (
            <div key={p.marker.key}>
              <span
                className={`tl-marker${passed ? "" : " future"}`}
                style={{ left: p.x, background: p.marker.color }}
                title={`${p.marker.title}: ${formatShortDate(p.date)}`}
              >
                {p.marker.code}
              </span>
              {labelled.has(p.index) && (
                <span className="tl-mdate" style={{ left: p.x }}>{formatShortDate(p.date)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
