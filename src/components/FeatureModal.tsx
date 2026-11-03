"use client";

import { useRef, useState } from "react";
import { useDialog } from "./useDialog";
import { StatusBadge } from "./StatusBadge";
import { formatDate } from "@/domain/roadmap";
import { MARKERS, STATUS_META, STATUS_ORDER } from "@/domain/status";
import type { Feature, FeatureGroup, FeatureStatus, Priority, Schedule } from "@/domain/types";
import { useProject } from "@/state/ProjectProvider";
import { aiClient } from "@/services/aiClient";
import { SourceNote } from "./AiPanel";
import type { AiSource, RecommendationsResult } from "@/ai/schemas";

interface Props {
  feature: Feature;
  group: FeatureGroup | undefined;
  allFeatures: Feature[];
  onOpenFeature: (id: string) => void;
  onClose: () => void;
}

interface Draft {
  name: string;
  description: string;
  priority: Priority;
  notes: string;
  schedule: Schedule;
  dependencies: string[];
}

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

const toDraft = (f: Feature): Draft => ({
  name: f.name,
  description: f.description,
  priority: f.priority,
  notes: f.notes,
  schedule: { ...f.schedule },
  dependencies: [...f.dependencies],
});

export function FeatureModal({ feature, group, allFeatures, onOpenFeature, onClose }: Props) {
  const store = useProject();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(feature));
  const [errors, setErrors] = useState<string[]>([]);
  const [recs, setRecs] = useState<{ data: RecommendationsResult; source: AiSource; warning?: string } | null>(null);
  const [recsBusy, setRecsBusy] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  const statusIndex = STATUS_ORDER.indexOf(feature.status);
  const dependencies = feature.dependencies.map((id) => allFeatures.find((f) => f.id === id)).filter((f): f is Feature => f !== undefined);
  const dependents = allFeatures.filter((f) => f.dependencies.includes(feature.id));
  const doneCount = feature.checkpoints.filter((c) => c.completed).length;

  useDialog(dialogRef, onClose);

  const run = (result: { ok: boolean; errors?: string[] }) => {
    setErrors(result.ok ? [] : (result as { errors: string[] }).errors);
    return result.ok;
  };

  const loadRecs = async () => {
    if (!store.project) return;
    setRecsBusy(true);
    setRecsError(null);
    const r = await aiClient.recommendations(store.project, feature.id);
    if (r.ok) setRecs({ data: r.envelope.data, source: r.envelope.source, warning: r.envelope.warning });
    else setRecsError(r.error);
    setRecsBusy(false);
  };

  const save = () => {
    if (run(store.updateFeature(feature.id, draft))) setEditing(false);
  };

  return (
    <div className="mr-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mr-modal" role="dialog" aria-modal="true" aria-labelledby="feature-modal-title" tabIndex={-1} ref={dialogRef}>
        <div className="mr-modal-head">
          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
              <StatusBadge status={feature.status} label />
              <span className="badge text-bg-light border text-capitalize">{feature.priority} priority</span>
              {group && <span className="text-muted small">{group.name}</span>}
            </div>
            <h2 id="feature-modal-title" className="h4 mb-1" style={{ color: "var(--mr-navy)" }}>{feature.name}</h2>
            <div className="text-muted">{feature.description || "No description."}</div>
          </div>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>

        <div className="mr-modal-body">
          {errors.length > 0 && (
            <div className="alert alert-danger py-2" role="alert">
              <ul className="mb-0 ps-3">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}

          {feature.risk && (
            <div className={`alert ${feature.risk.level === "high" ? "alert-danger" : "alert-warning"} py-2`}>
              <strong><i className="bi bi-exclamation-triangle-fill me-1" />{feature.risk.level === "high" ? "High" : "Medium"} risk:</strong> {feature.risk.description}
              <div className="small mt-1"><strong>Suggested mitigation:</strong> {feature.risk.mitigation}</div>
            </div>
          )}

          <div className="mr-section-title">Status</div>
          <div className="d-flex align-items-center gap-2">
            <select
              className="form-select form-select-sm w-auto"
              aria-label="Feature status"
              value={feature.status}
              onChange={(e) => run(store.changeStatus(feature.id, e.target.value as FeatureStatus))}
            >
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <span className="small text-muted">Moving forward requires the earlier checkpoints to be completed.</span>
          </div>

          {editing ? (
            <>
              <div className="mr-section-title">Details</div>
              <div className="row g-2">
                <div className="col-md-8">
                  <label className="form-label small mb-1" htmlFor="f-name">Name</label>
                  <input id="f-name" className="form-control form-control-sm" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small mb-1" htmlFor="f-prio">Priority</label>
                  <select id="f-prio" className="form-select form-select-sm text-capitalize" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small mb-1" htmlFor="f-desc">Description</label>
                  <textarea id="f-desc" rows={2} className="form-control form-control-sm" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
              </div>

              <div className="mr-section-title">Dates</div>
              <div className="row g-2">
                {MARKERS.map((m) => (
                  <div key={m.key} className="col-6 col-md-4">
                    <label className="form-label small mb-1" htmlFor={`d-${m.key}`}>{m.code} · {m.title}</label>
                    <input
                      id={`d-${m.key}`}
                      type="date"
                      className="form-control form-control-sm"
                      value={draft.schedule[m.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, schedule: { ...draft.schedule, [m.key]: e.target.value || undefined } })}
                    />
                  </div>
                ))}
              </div>

              <div className="mr-section-title">Depends on</div>
              <div className="border rounded p-2" style={{ maxHeight: 150, overflowY: "auto" }}>
                {allFeatures.filter((f) => f.id !== feature.id).map((f) => (
                  <div className="form-check" key={f.id}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`dep-${f.id}`}
                      checked={draft.dependencies.includes(f.id)}
                      onChange={(e) => setDraft({ ...draft, dependencies: e.target.checked ? [...draft.dependencies, f.id] : draft.dependencies.filter((d) => d !== f.id) })}
                    />
                    <label className="form-check-label" htmlFor={`dep-${f.id}`}>{f.name}</label>
                  </div>
                ))}
              </div>

              <div className="mr-section-title">Notes</div>
              <textarea aria-label="Notes" rows={3} className="form-control form-control-sm" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </>
          ) : (
            <>
              <div className="mr-section-title">Schedule</div>
              {MARKERS.map((marker, i) => {
                const date = feature.schedule[marker.key];
                const passed = statusIndex > i;
                const current = statusIndex >= 1 && statusIndex === i;
                return (
                  <div key={marker.key} className="mr-stage-row">
                    <span className="mr-ms-badge" style={{ background: marker.color, height: 26, minWidth: 34, fontSize: 11 }}>{marker.code}</span>
                    <span className={current ? "fw-bold" : ""}>
                      {marker.title} <span className="text-muted">— {marker.subtitle}</span>
                      {current && <span className="ms-2 small" style={{ color: STATUS_META[feature.status].color }}>in progress</span>}
                    </span>
                    <span className={passed ? "text-success fw-semibold" : "text-muted"}>
                      {passed && <i className="bi bi-check2 me-1" />}{date ? formatDate(date) : "Not scheduled"}
                    </span>
                  </div>
                );
              })}
            </>
          )}

          <div className="mr-section-title">Checkpoints ({doneCount}/{feature.checkpoints.length})</div>
          {feature.checkpoints.map((cp) => (
            <label key={cp.id} className={`mr-cp ${cp.completed ? "done" : "todo"}`} style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                className="form-check-input mt-1"
                checked={cp.completed}
                onChange={() => run(store.toggleCheckpoint(feature.id, cp.id))}
              />
              <div>
                <div className="fw-semibold">{cp.name}{cp.completedAt && <span className="text-muted fw-normal small"> · completed {formatDate(cp.completedAt)}</span>}</div>
                <div className="text-muted small">{cp.description}</div>
                <div className="small text-muted">Criteria: {cp.acceptanceCriteria.join(" · ")}</div>
              </div>
            </label>
          ))}

          {!editing && (
            <>
              <div className="mr-section-title">Dependencies</div>
              {dependencies.length === 0 && dependents.length === 0 && <div className="text-muted">No dependencies.</div>}
              {dependencies.length > 0 && (
                <div className="mb-2">
                  <span className="text-muted">Depends on: </span>
                  {dependencies.map((d, i) => (
                    <span key={d.id}>{i > 0 && ", "}<button type="button" className="mr-linkbtn" onClick={() => onOpenFeature(d.id)}>{d.name}</button> <StatusBadge status={d.status} /></span>
                  ))}
                </div>
              )}
              {dependents.length > 0 && (
                <div>
                  <span className="text-muted">Needed by: </span>
                  {dependents.map((d, i) => (
                    <span key={d.id}>{i > 0 && ", "}<button type="button" className="mr-linkbtn" onClick={() => onOpenFeature(d.id)}>{d.name}</button></span>
                  ))}
                </div>
              )}

              <div className="mr-section-title">Notes</div>
              <div className={feature.notes ? "" : "text-muted"} style={{ whiteSpace: "pre-wrap" }}>{feature.notes || "No notes yet."}</div>

              <div className="mr-section-title">AI recommendations</div>
              {!recs && (
                <button type="button" className="btn btn-outline-primary btn-sm" onClick={loadRecs} disabled={recsBusy}>
                  {recsBusy ? <><span className="spinner-border spinner-border-sm me-2" />Thinking…</> : <><i className="bi bi-stars me-1" aria-hidden="true" />Get recommendations</>}
                </button>
              )}
              {recsError && <div className="alert alert-danger py-2 mt-2" role="alert">{recsError}</div>}
              {recs && (
                <div aria-live="polite">
                  <SourceNote source={recs.source} warning={recs.warning} />
                  {recs.data.recommendations.map((r) => (
                    <div key={r.title} className="mb-2"><div className="fw-semibold">{r.title}</div><div className="small text-muted">{r.detail}</div></div>
                  ))}
                  <div className="small text-muted">Advisory only: nothing was changed.</div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="d-flex justify-content-end align-items-center gap-2 px-4 py-3 border-top">
          {editing ? (
            <>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setEditing(false); setErrors([]); setDraft(toDraft(feature)); }}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={save}>Save changes</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => { setDraft(toDraft(feature)); setErrors([]); setEditing(true); }}>
                <i className="bi bi-pencil me-1" aria-hidden="true" />Edit details
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
