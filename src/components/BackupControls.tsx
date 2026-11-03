"use client";

import { useRef, useState } from "react";
import { useDialog } from "./useDialog";
import { backupFileName, parseBackup, planImport, resolveImport, type ImportDecision, type ParsedBackup } from "@/domain/backup";
import { useProject } from "@/state/ProjectProvider";

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Export-everything and import buttons for the projects page header. */
export function BackupControls() {
  const { exportProjects, projects } = useProject();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ fileName: string; backup: ParsedBackup } | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "danger"; text: string } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    if (file.size > MAX_BACKUP_BYTES) return setMessage({ kind: "danger", text: "That file is too large to be a MobileRoad backup." });
    const result = parseBackup(await file.text());
    if (!result.ok) return setMessage({ kind: "danger", text: result.error });
    setParsed({ fileName: file.name, backup: result.value });
  };

  return (
    <>
      <button type="button" className="btn btn-outline-secondary" disabled={projects.length === 0} onClick={() => downloadJson(backupFileName(), exportProjects())}>
        <i className="bi bi-download me-1" aria-hidden="true" />Export all
      </button>
      <button type="button" className="btn btn-outline-secondary" onClick={() => inputRef.current?.click()}>
        <i className="bi bi-upload me-1" aria-hidden="true" />Import backup
      </button>
      <input ref={inputRef} type="file" accept=".json,application/json" className="visually-hidden" aria-label="Import backup file" tabIndex={-1} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {message && (
        <div className={`alert alert-${message.kind} py-2 w-100 mb-0 mt-2`} role={message.kind === "danger" ? "alert" : "status"}>{message.text}</div>
      )}
      {parsed && (
        <ImportDialog
          fileName={parsed.fileName}
          backup={parsed.backup}
          onClose={() => setParsed(null)}
          onDone={(text) => { setParsed(null); setMessage({ kind: "success", text }); }}
        />
      )}
    </>
  );
}

function ImportDialog({ fileName, backup, onClose, onDone }: { fileName: string; backup: ParsedBackup; onClose: () => void; onDone: (text: string) => void }) {
  const { projects, importProjects } = useProject();
  const dialogRef = useRef<HTMLDivElement>(null);
  const plan = planImport(projects.map((p) => p.id), backup.projects);
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>(() => Object.fromEntries(plan.filter((p) => p.conflict).map((p) => [p.project.id, "copy" as ImportDecision])));

  useDialog(dialogRef, onClose);

  const apply = () => {
    const { toSave, replaced, copied, skipped } = resolveImport(projects.map((p) => p.id), backup.projects, decisions);
    if (toSave.length > 0) importProjects(toSave);
    const parts = [`${toSave.length} project(s) imported`];
    if (replaced.length) parts.push(`${replaced.length} replaced`);
    if (copied.length) parts.push(`${copied.length} kept as copies`);
    if (skipped.length) parts.push(`${skipped.length} skipped`);
    onDone(`${parts.join(", ")}.`);
  };

  const nothing = backup.projects.length === 0;
  return (
    <div className="mr-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mr-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} ref={dialogRef}>
        <div className="mr-modal-head">
          <div className="flex-grow-1">
            <h2 id="import-title" className="h5 mb-1" style={{ color: "var(--mr-navy)" }}>Import backup</h2>
            <div className="small text-muted">{fileName}{backup.exportedAt && ` · exported ${new Date(backup.exportedAt).toLocaleString("en-GB")}`}</div>
          </div>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="mr-modal-body">
          {plan.map(({ project, conflict }) => (
            <div key={project.id} className="border rounded p-2 mb-2 d-flex flex-wrap align-items-center gap-2">
              <div className="flex-grow-1">
                <div className="fw-semibold">{project.name}</div>
                <div className="small text-muted">{project.features.length} features{conflict ? " · already exists in this browser" : " · new"}</div>
              </div>
              {conflict && (
                <select className="form-select form-select-sm w-auto" aria-label={`What to do with ${project.name}`} value={decisions[project.id]} onChange={(e) => setDecisions((d) => ({ ...d, [project.id]: e.target.value as ImportDecision }))}>
                  <option value="copy">Keep both (import as copy)</option>
                  <option value="replace">Replace the existing one</option>
                  <option value="skip">Skip</option>
                </select>
              )}
            </div>
          ))}
          {backup.invalid.length > 0 && (
            <div className="alert alert-warning py-2 small" role="alert">
              <strong>{backup.invalid.length} project(s) in the file could not be read and will not be imported:</strong>
              <ul className="mb-0 ps-3">{backup.invalid.map((i) => <li key={i.position}>{i.name} — {i.reason}</li>)}</ul>
            </div>
          )}
          {nothing && <div className="text-muted">There is nothing valid to import.</div>}
        </div>
        <div className="d-flex justify-content-end gap-2 px-4 py-3 border-top">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={nothing}>Import</button>
        </div>
      </div>
    </div>
  );
}
