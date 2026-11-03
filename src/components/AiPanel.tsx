"use client";

import { useRef, useState } from "react";
import { useDialog } from "./useDialog";
import type { AdvisorResult, AiSource, AuditResult, ScopeImpactResult } from "@/ai/schemas";
import { aiClient } from "@/services/aiClient";
import { useProject } from "@/state/ProjectProvider";

type Tab = "advisor" | "audit" | "scope";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "advisor", label: "Ask the advisor", icon: "bi-chat-dots" },
  { id: "audit", label: "Project audit", icon: "bi-clipboard-check" },
  { id: "scope", label: "What happens if…?", icon: "bi-shuffle" },
];

const SUGGESTIONS = ["What should I do next?", "Is my application ready for production?", "What could delay my launch?", "What should I ask my developer?", "Do I need a backend for this application?"];

const SEVERITY_CLASS: Record<string, string> = { critical: "text-bg-danger", high: "text-bg-danger", medium: "text-bg-warning", low: "text-bg-secondary" };

export function SourceNote({ source, warning }: { source: AiSource; warning?: string }) {
  return (
    <div className="small mb-2">
      <span className={`badge ${source === "gemini" ? "text-bg-primary" : "text-bg-secondary"}`}>{source === "gemini" ? "Gemini" : "Offline mock AI"}</span>
      {warning && <span className="ms-2 text-warning-emphasis">{warning}</span>}
      {source === "mock" && !warning && <span className="ms-2 text-muted">No GEMINI_API_KEY configured: answers are generated from your project data with built-in rules.</span>}
    </div>
  );
}

export function AiPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("advisor");
  const dialogRef = useRef<HTMLDivElement>(null);

  useDialog(dialogRef, onClose);

  return (
    <div className="mr-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mr-modal" style={{ maxWidth: 860 }} role="dialog" aria-modal="true" aria-labelledby="ai-title" tabIndex={-1} ref={dialogRef}>
        <div className="mr-modal-head">
          <div className="flex-grow-1">
            <h2 id="ai-title" className="h5 mb-1" style={{ color: "var(--mr-navy)" }}><i className="bi bi-stars me-2" aria-hidden="true" />AI Advisor</h2>
            <div className="small text-muted">Recommendations are advisory. Nothing changes in your roadmap unless you confirm it.</div>
          </div>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="d-flex gap-1 px-3 pt-2 border-bottom" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-light"} mb-2`} onClick={() => setTab(t.id)}>
              <i className={`bi ${t.icon} me-1`} aria-hidden="true" />{t.label}
            </button>
          ))}
        </div>
        <div className="mr-modal-body">
          <div hidden={tab !== "advisor"}><AdvisorTab /></div>
          <div hidden={tab !== "audit"}><AuditTab /></div>
          <div hidden={tab !== "scope"}><ScopeTab onDone={onClose} /></div>
        </div>
      </div>
    </div>
  );
}

interface Turn { role: "user" | "assistant"; content: string; steps?: string[]; source?: AiSource; warning?: string }

function AdvisorTab() {
  const { project } = useProject();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (text: string) => {
    if (!project || !text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const history = turns.slice(-8).map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setQuestion("");
    const result = await aiClient.ask(project, text, history);
    if (result.ok) {
      const d: AdvisorResult = result.envelope.data;
      setTurns((prev) => [...prev, { role: "assistant", content: d.answer, steps: d.suggestedNextSteps, source: result.envelope.source, warning: result.envelope.warning }]);
    } else setError(result.error);
    setBusy(false);
  };

  return (
    <>
      {turns.length === 0 && (
        <div className="mb-3">
          <div className="text-muted mb-2">Ask anything about <strong>{project?.name}</strong>. Try:</div>
          <div className="d-flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => ask(s)}>{s}</button>)}
          </div>
        </div>
      )}
      <div aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className={`mb-3 ${t.role === "user" ? "text-end" : ""}`}>
            <div className={`d-inline-block p-2 px-3 rounded-3 text-start ${t.role === "user" ? "bg-primary text-white" : "bg-light border"}`} style={{ maxWidth: "90%" }}>
              {t.role === "assistant" && t.source && <SourceNote source={t.source} warning={t.warning} />}
              <div style={{ whiteSpace: "pre-wrap" }}>{t.content}</div>
              {t.steps && t.steps.length > 0 && (
                <ul className="mt-2 mb-0 ps-3 small">{t.steps.map((s) => <li key={s}>{s}</li>)}</ul>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-muted mb-3" role="status"><span className="spinner-border spinner-border-sm me-2" />Thinking…</div>}
      </div>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="d-flex gap-2">
        <input className="form-control" aria-label="Your question" placeholder="Ask about your project…" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} />
        <button className="btn btn-primary" type="submit" disabled={busy || !question.trim()}>Send</button>
      </form>
    </>
  );
}

function AuditTab() {
  const { project } = useProject();
  const [result, setResult] = useState<{ data: AuditResult; source: AiSource; warning?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!project) return;
    setBusy(true);
    setError(null);
    const r = await aiClient.audit(project);
    if (r.ok) setResult({ data: r.envelope.data, source: r.envelope.source, warning: r.envelope.warning });
    else setError(r.error);
    setBusy(false);
  };

  return (
    <>
      <p className="text-muted">Reviews the roadmap for missing tasks, unmet prerequisites, risks, unrealistic dates, testing, security, deployment and maintenance gaps.</p>
      <button type="button" className="btn btn-primary btn-sm mb-3" onClick={run} disabled={busy || !project}>
        {busy ? <><span className="spinner-border spinner-border-sm me-2" />Auditing…</> : <><i className="bi bi-clipboard-check me-1" aria-hidden="true" />{result ? "Run audit again" : "Run audit"}</>}
      </button>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      {result && (
        <div aria-live="polite">
          <SourceNote source={result.source} warning={result.warning} />
          <p className="fw-semibold">{result.data.summary}</p>
          {result.data.recommendations.map((r, i) => (
            <div key={i} className="border rounded p-3 mb-2">
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className={`badge text-capitalize ${SEVERITY_CLASS[r.severity]}`}>{r.severity}</span>
                {r.related && <span className="small text-muted">{r.related}</span>}
              </div>
              <div className="fw-semibold">{r.description}</div>
              <div className="small"><strong>Why it matters:</strong> {r.whyItMatters}</div>
              <div className="small"><strong>Suggested action:</strong> {r.suggestedAction}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ScopeTab({ onDone }: { onDone: () => void }) {
  const { project, addAcceptedFeatures } = useProject();
  const [change, setChange] = useState("");
  const [result, setResult] = useState<{ data: ScopeImpactResult; source: AiSource; warning?: string } | null>(null);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!project || change.trim().length < 5) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await aiClient.scopeChange(project, change);
    if (r.ok) {
      setResult({ data: r.envelope.data, source: r.envelope.source, warning: r.envelope.warning });
      setAccepted(new Set(r.envelope.data.newFeatures.map((_, i) => i)));
    } else setError(r.error);
    setBusy(false);
  };

  const apply = () => {
    if (!result || !project) return;
    const features = result.data.newFeatures
      .filter((_, i) => accepted.has(i))
      .map((f) => ({ name: f.name, description: f.description, groupId: f.group, priority: f.priority, estimatedDays: f.estimatedDays, dependencies: f.dependencies }));
    const outcome = addAcceptedFeatures(features);
    if (outcome.ok) onDone();
    else setError(outcome.errors.join(" "));
  };

  const d = result?.data;
  const list = (title: string, items: string[]) => items.length > 0 && (
    <div className="mb-2"><div className="mr-section-title mt-3">{title}</div><ul className="mb-0 ps-3">{items.map((x) => <li key={x}>{x}</li>)}</ul></div>
  );

  return (
    <>
      <label htmlFor="scope-change" className="form-label">Describe the new requirement or change</label>
      <textarea id="scope-change" className="form-control mb-2" rows={2} placeholder="The client wants to add real-time messaging." value={change} onChange={(e) => setChange(e.target.value)} maxLength={2000} />
      <button type="button" className="btn btn-primary btn-sm" onClick={analyze} disabled={busy || change.trim().length < 5 || !project}>
        {busy ? <><span className="spinner-border spinner-border-sm me-2" />Analyzing…</> : "Analyze impact"}
      </button>
      {error && <div className="alert alert-danger py-2 mt-3" role="alert">{error}</div>}
      {d && result && (
        <div className="mt-3" aria-live="polite">
          <SourceNote source={result.source} warning={result.warning} />
          <p className="fw-semibold mb-1">{d.summary}</p>
          <div className="alert alert-info py-2 mb-2"><strong>Schedule impact:</strong> +{d.scheduleImpactDays} days. {d.scheduleImpactNote}</div>
          {list("Existing features affected", d.affectedFeatures)}
          <div className="mr-section-title mt-3">Proposed new work — choose what to add</div>
          {d.newFeatures.length === 0 && <div className="text-muted">No new features proposed.</div>}
          {d.newFeatures.map((f, i) => (
            <label key={i} className="d-flex gap-2 border rounded p-2 mb-2" style={{ cursor: "pointer" }}>
              <input type="checkbox" className="form-check-input mt-1" checked={accepted.has(i)} onChange={(e) => setAccepted((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
              <span>
                <span className="fw-semibold">{f.name}</span> <span className="badge text-bg-light border text-capitalize">{f.priority}</span> <span className="small text-muted">~{f.estimatedDays} days</span>
                <span className="d-block small text-muted">{f.description}</span>
              </span>
            </label>
          ))}
          {list("Additional dependencies", d.additionalDependencies)}
          {list("Architectural implications", d.architecturalImplications)}
          {list("Risks", d.risks)}
          {list("Testing implications", d.testingImplications)}
          {list("Deployment implications", d.deploymentImplications)}
          <div className="d-flex gap-2 mt-3">
            <button type="button" className="btn btn-success btn-sm" onClick={apply} disabled={accepted.size === 0}>Add {accepted.size} selected to roadmap</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => { setResult(null); setError(null); }}>Discard all</button>
          </div>
          <div className="small text-muted mt-2">New features start as “Not Started”. Existing features are never changed by this review.</div>
        </div>
      )}
    </>
  );
}
