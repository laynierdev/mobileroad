"use client";

import { NoProject } from "./NoProject";
import { useProject } from "@/state/ProjectProvider";

export function PhasesView() {
  const { status, project } = useProject();
  if (status === "loading") return <div className="mr-loading" role="status">Loading project…</div>;
  if (!project) return <NoProject />;
  const { phases } = project;
  return (
    <div className="mr-page">
      <h1 className="mr-title mb-1">Phases guide</h1>
      <p className="mr-subtitle mb-4">The lifecycle from business idea to production, explained in plain language. Showing the phases of the open project.</p>
      <div className="d-grid gap-3">
        {[...phases].sort((a, b) => a.order - b.order).map((p) => (
          <article key={p.id} className="mr-card mr-phase-card p-4" id={p.id}>
            <div className="d-flex align-items-center gap-3 mb-2">
              <span className="mr-phase-num">{p.order}</span>
              <div>
                <h2 className="h5 mb-0 fw-bold">{p.name}</h2>
                <div className="text-muted">{p.description}</div>
              </div>
            </div>
            <div className="row g-4 mt-1">
              <div className="col-lg-6">
                <div className="mr-section-title">What this phase means</div>
                <p className="mb-2">{p.meaning}</p>
                <div className="mr-section-title">Why it matters</div>
                <p className="mb-2">{p.whyItMatters}</p>
                <div className="mr-section-title">What you need to do</div>
                <ul className="mb-2 ps-3">{p.whatYouDo.map((x) => <li key={x}>{x}</li>)}</ul>
                <div className="mr-section-title">A successful outcome</div>
                <p className="mb-0">{p.successLooksLike}</p>
              </div>
              <div className="col-lg-6">
                <div className="mr-section-title">Checklist</div>
                <ul className="list-unstyled mb-2">
                  {p.checkpoints.map((c) => (
                    <li key={c}><i className="bi bi-square me-2 text-muted" aria-hidden="true" />{c}</li>
                  ))}
                </ul>
                <div className="mr-section-title">Common mistakes</div>
                <ul className="mb-2 ps-3">{p.commonMistakes.map((x) => <li key={x}>{x}</li>)}</ul>
                <div className="mr-section-title">What happens next</div>
                <p className="mb-2">{p.whatsNext}</p>
                <details>
                  <summary className="text-primary fw-semibold" style={{ cursor: "pointer" }}>Technical details</summary>
                  <p className="mt-2 mb-0 text-muted">{p.technicalDetails}</p>
                </details>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
