"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildTimelineRange,
  countAtRisk,
  countByStatus,
  deriveMilestones,
  formatDate,
  groupFeatures,
  productionPercent,
  projectHealth,
  toIso,
} from "@/domain/roadmap";
import { STATUS_META, STATUS_ORDER } from "@/domain/status";
import type { FeatureStatus, Project } from "@/domain/types";
import { useProject } from "@/state/ProjectProvider";
import { NoProject } from "./NoProject";
import { FeatureModal } from "./FeatureModal";
import { KpiCards } from "./KpiCards";
import { MilestoneCards } from "./MilestoneCards";
import { OverallProgress } from "./OverallProgress";
import { Timeline } from "./Timeline";

export function RoadmapDashboard() {
  const { status, project, today, resetDemo } = useProject();
  if (status === "loading") return <div className="mr-loading" role="status">Loading project…</div>;
  if (!project) return <NoProject />;
  return <Dashboard key={project.id} project={project} today={today} onReset={resetDemo} />;
}

function Dashboard({ project, today, onReset }: { project: Project; today: Date; onReset: () => void }) {
  const [filter, setFilter] = useState<FeatureStatus | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const features = project.features;
  const counts = useMemo(() => countByStatus(features), [features]);
  const visible = useMemo(() => (filter ? features.filter((f) => f.status === filter) : features), [features, filter]);
  const groups = useMemo(() => groupFeatures(project, visible, today), [project, visible, today]);
  const range = useMemo(() => buildTimelineRange(features, today), [features, today]);
  const milestones = useMemo(() => deriveMilestones(features, today), [features, today]);
  const atRisk = countAtRisk(features, today);
  const health = projectHealth(features, today);
  const openFeature = features.find((f) => f.id === openId) ?? null;

  const toggleGroup = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const closeModal = useCallback(() => setOpenId(null), []);

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(g.id));
  const first = range.months[0];
  const last = range.months[range.months.length - 1];

  return (
    <>
      <div className="mr-page">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <h1 className="mr-title d-inline">{project.name} Roadmap</h1>
            <span className="mr-subtitle ms-3">({features.length} total features, {visible.length} shown in timeline)</span>
            {project.isDemo && <span className="badge text-bg-warning ms-2 align-middle">Demo project</span>}
          </div>
          <div className="d-flex align-items-center gap-3">
            {health === "healthy" ? (
              <span className="mr-chip-ok"><i className="bi bi-check-circle me-1" />Healthy</span>
            ) : (
              <span className={health === "critical" ? "mr-chip-risk" : "mr-chip-warn"}>{atRisk} At Risk</span>
            )}
            {project.isDemo && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => window.confirm("Reset the demo project? Your changes to it will be lost.") && onReset()}
              >
                <i className="bi bi-arrow-counterclockwise me-1" aria-hidden="true" />Reset demo
              </button>
            )}
            <span className="mr-today">Today: <strong>{formatDate(toIso(today))}</strong></span>
          </div>
        </div>

        <KpiCards total={features.length} shown={visible.length} counts={counts} filter={filter} onFilter={setFilter} />
        <div className="mt-3">
          <OverallProgress total={features.length} counts={counts} productionPercent={productionPercent(features)} />
        </div>
        <div className="mt-3">
          <MilestoneCards milestones={milestones} />
        </div>
      </div>

      <div className="mr-legend-bar mt-1">
        <div className="mr-page d-flex flex-wrap align-items-center gap-3 py-2">
          {STATUS_ORDER.map((s) => (
            <span key={s} className="mr-legend-item">
              <span className={`mr-code${s === "not_started" ? " ns" : ""}`} style={{ background: STATUS_META[s].color }}>{STATUS_META[s].code}</span>
              {STATUS_META[s].label}
            </span>
          ))}
          <span className="ms-auto d-flex align-items-center gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.id)))}>
              <i className={`bi ${allCollapsed ? "bi-arrows-expand" : "bi-arrows-collapse"} me-1`} aria-hidden="true" />
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
            {filter && (
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setFilter(null)}>
                <i className="bi bi-x-circle me-1" aria-hidden="true" />Clear filter: {STATUS_META[filter].label}
              </button>
            )}
            <span className="mr-range">Timeline: <strong>{first.label}</strong> - <strong>{last.label}</strong></span>
          </span>
        </div>
      </div>

      <div className="mr-page pt-3">
        <Timeline range={range} groups={groups} today={today} collapsed={collapsed} onToggleGroup={toggleGroup} onOpenFeature={setOpenId} />
      </div>

      {openFeature && (
        <FeatureModal
          key={openFeature.id}
          feature={openFeature}
          group={project.groups.find((g) => g.id === openFeature.groupId)}
          allFeatures={features}
          onOpenFeature={setOpenId}
          onClose={closeModal}
        />
      )}
    </>
  );
}
