"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackupControls, downloadJson } from "./BackupControls";
import { backupFileName } from "@/domain/backup";
import { countByStatus, productionPercent } from "@/domain/roadmap";
import { useProject } from "@/state/ProjectProvider";

export function ProjectsView() {
  const router = useRouter();
  const { status, projects, project: active, openProject, deleteProject, loadDemo, exportProjects } = useProject();
  if (status === "loading") return <div className="mr-loading" role="status">Loading projects…</div>;

  const hasDemo = projects.some((p) => p.isDemo);
  const sorted = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="mr-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <h1 className="mr-title">Projects</h1>
        <div className="d-flex flex-wrap gap-2 justify-content-end">
          <BackupControls />
          {!hasDemo && <button type="button" className="btn btn-outline-secondary" onClick={loadDemo}>Load demo project</button>}
          <Link href="/projects/new" className="btn btn-primary"><i className="bi bi-plus-lg me-1" aria-hidden="true" />New project</Link>
        </div>
      </div>

      {sorted.length === 0 && (
        <div className="mr-card p-5 text-center">
          <h2 className="h5">No projects yet</h2>
          <p className="text-muted">Create your first project from an idea or a requirements document, or explore the demo.</p>
          <div className="d-flex gap-2 justify-content-center">
            <Link href="/projects/new" className="btn btn-primary">New project</Link>
            <button type="button" className="btn btn-outline-secondary" onClick={loadDemo}>Load demo project</button>
          </div>
        </div>
      )}

      <div className="d-grid gap-3">
        {sorted.map((p) => {
          const isActive = active?.id === p.id;
          const counts = isActive && active ? countByStatus(active.features) : null;
          return (
            <article key={p.id} className={`mr-card p-4${isActive ? " border-primary" : ""}`}>
              <div className="d-flex flex-wrap justify-content-between gap-3">
                <div>
                  <h2 className="h5 fw-bold mb-1">
                    {p.name}
                    {p.isDemo && <span className="badge text-bg-warning ms-2">Demo</span>}
                    {isActive && <span className="badge text-bg-primary ms-2">Open</span>}
                  </h2>
                  <div className="small text-muted">Updated {new Date(p.updatedAt).toLocaleString("en-GB")}</div>
                  {isActive && active && counts && (
                    <div className="small text-muted mt-1">{active.features.length} features · {counts.production} in production · {productionPercent(active.features)}% complete</div>
                  )}
                </div>
                <div className="d-flex gap-2 align-self-center">
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => openProject(p.id) && router.push("/")}>Open roadmap</button>
                  <button type="button" className="btn btn-outline-secondary btn-sm" aria-label={`Export ${p.name}`} title="Export this project" onClick={() => downloadJson(backupFileName(), exportProjects([p.id]))}>
                    <i className="bi bi-download" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => window.confirm(`Delete "${p.name}"? This cannot be undone.`) && deleteProject(p.id)}
                  >
                    <i className="bi bi-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
