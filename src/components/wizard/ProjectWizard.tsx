"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { AiSource, AnalysisResult, RoadmapResult } from "@/ai/schemas";
import { buildProjectFromRoadmap, type ProjectDetails } from "@/domain/projectBuilder";
import { toIso } from "@/domain/roadmap";
import type { ExperienceLevel, Project } from "@/domain/types";
import { aiClient, uploadDocument } from "@/services/aiClient";
import { useProject } from "@/state/ProjectProvider";
import { SourceNote } from "../AiPanel";
import { EditableList } from "./EditableList";

type Step = "method" | "details" | "review" | "roadmap";
type Method = "form" | "document";

const STEPS: { id: Step; label: string }[] = [
  { id: "method", label: "Method" },
  { id: "details", label: "Project details" },
  { id: "review", label: "Review analysis" },
  { id: "roadmap", label: "Review roadmap" },
];

const lines = (s: string) => s.split("\n").map((l) => l.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);

interface Form {
  name: string;
  description: string;
  targetAudience: string;
  objectives: string;
  mainFeatures: string;
  platform: Project["platform"];
  techStack: string;
  teamSize: string;
  budget: string;
  launchDate: string;
  experience: ExperienceLevel;
  documentText: string;
}

const EMPTY: Form = { name: "", description: "", targetAudience: "", objectives: "", mainFeatures: "", platform: "both", techStack: "", teamSize: "", budget: "", launchDate: "", experience: "none", documentText: "" };

function composeBrief(method: Method, f: Form): string {
  const header = [`Project: ${f.name}`, `Platform: ${f.platform}`, f.techStack && `Preferred technology: ${f.techStack}`, f.teamSize && `Team size: ${f.teamSize}`, f.budget && `Budget: ${f.budget}`, f.launchDate && `Target launch: ${f.launchDate}`, `Technical experience: ${f.experience}`].filter(Boolean).join("\n");
  if (method === "document") return `${header}\n\n${f.documentText.trim()}`;
  return `${header}\n\nDescription: ${f.description.trim()}\nTarget audience: ${f.targetAudience.trim()}\nBusiness objectives:\n${lines(f.objectives).map((l) => `- ${l}`).join("\n")}\nMain features:\n${lines(f.mainFeatures).map((l) => `- ${l}`).join("\n")}`;
}

function briefFromAnalysis(name: string, a: AnalysisResult): string {
  const section = (title: string, items: string[]) => (items.length ? `${title}:\n${items.map((i) => `- ${i}`).join("\n")}\n` : "");
  return [
    `Project: ${name}\nSummary: ${a.summary}\n`,
    section("Business objectives", a.businessObjectives),
    section("User roles", a.userRoles),
    section("Functional requirements", a.functionalRequirements.map((r) => r.text)),
    section("Non-functional requirements", a.nonFunctionalRequirements.map((r) => r.text)),
    section("Major features", a.majorFeatures),
    section("External integrations", a.externalIntegrations),
    section("Security requirements", a.securityRequirements),
    section("Assumptions", a.assumptions),
    section("Risks", a.risks),
  ].join("\n");
}

export function ProjectWizard() {
  const router = useRouter();
  const store = useProject();
  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<Method>("form");
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadNote, setUploadNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ data: AnalysisResult; source: AiSource; warning?: string } | null>(null);
  const [roadmap, setRoadmap] = useState<{ data: RoadmapResult; source: AiSource; warning?: string } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [startDate, setStartDate] = useState(() => toIso(new Date()));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const validateDetails = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Give the project a name.";
    else if (form.name.length > 80) e.name = "Use 80 characters or fewer.";
    if (method === "form") {
      if (form.description.trim().length < 10) e.description = "Describe the business in at least a sentence.";
    } else if (form.documentText.trim().length < 10) e.documentText = "Upload a document or paste your requirements.";
    if (form.teamSize && (!Number.isInteger(Number(form.teamSize)) || Number(form.teamSize) < 1)) e.teamSize = "Enter a whole number of 1 or more.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadNote(null);
    setBusy("Reading document…");
    const result = await uploadDocument(file);
    setBusy(null);
    if (result.ok) {
      set("documentText", result.text);
      setUploadNote({ ok: true, text: `Extracted ${result.text.length.toLocaleString()} characters from ${result.fileName}. Review the text below before continuing.` });
      setErrors((e) => ({ ...e, documentText: "" }));
    } else setUploadNote({ ok: false, text: `${result.error} Your existing text was kept.` });
  };

  const runAnalysis = async () => {
    if (!validateDetails()) return;
    setBusy("Analyzing requirements…");
    setError(null);
    const r = await aiClient.analyze(composeBrief(method, form), form.name);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setAnalysis({ data: r.envelope.data, source: r.envelope.source, warning: r.envelope.warning });
    setStep("review");
  };

  const runRoadmap = async () => {
    if (!analysis) return;
    setBusy("Generating roadmap…");
    setError(null);
    const r = await aiClient.roadmap(briefFromAnalysis(form.name, analysis.data), { projectName: form.name, platform: form.platform, teamSize: form.teamSize ? Number(form.teamSize) : undefined });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setRoadmap({ data: r.envelope.data, source: r.envelope.source, warning: r.envelope.warning });
    setSelected(new Set(r.envelope.data.features.map((_, i) => i)));
    setStep("roadmap");
  };

  const create = () => {
    if (!roadmap || !analysis) return;
    const details: ProjectDetails = {
      name: form.name,
      description: analysis.data.summary,
      targetAudience: method === "form" ? form.targetAudience : analysis.data.userRoles.join(", "),
      businessGoals: analysis.data.businessObjectives,
      platform: form.platform,
      techStack: form.techStack,
      teamSize: form.teamSize ? Number(form.teamSize) : undefined,
      budget: form.budget || undefined,
      experienceLevel: form.experience,
      targetLaunchDate: form.launchDate || undefined,
    };
    const chosen: RoadmapResult = { ...roadmap.data, features: roadmap.data.features.filter((_, i) => selected.has(i)) };
    const parsedStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(`${startDate}T00:00:00`) : new Date();
    store.createProject(buildProjectFromRoadmap(details, chosen, parsedStart));
    router.push("/");
  };

  const updateAnalysis = (patch: Partial<AnalysisResult>) => setAnalysis((a) => (a ? { ...a, data: { ...a.data, ...patch } } : a));
  const featuresByGroup = useMemo(() => {
    const map = new Map<string, { index: number; name: string; description: string; priority: string; days: number }[]>();
    roadmap?.data.features.forEach((f, index) => {
      const g = f.group.trim() || "General";
      map.set(g, [...(map.get(g) ?? []), { index, name: f.name, description: f.description, priority: f.priority, days: f.estimatedDays }]);
    });
    return [...map.entries()];
  }, [roadmap]);

  const field = (id: keyof Form, label: string, props: { textarea?: boolean; type?: string; placeholder?: string; rows?: number } = {}) => (
    <div className="mb-3">
      <label className="form-label small fw-semibold mb-1" htmlFor={`w-${id}`}>{label}</label>
      {props.textarea ? (
        <textarea id={`w-${id}`} className={`form-control form-control-sm${errors[id] ? " is-invalid" : ""}`} rows={props.rows ?? 3} placeholder={props.placeholder} value={form[id]} onChange={(e) => set(id, e.target.value as never)} />
      ) : (
        <input id={`w-${id}`} type={props.type ?? "text"} className={`form-control form-control-sm${errors[id] ? " is-invalid" : ""}`} placeholder={props.placeholder} value={form[id]} onChange={(e) => set(id, e.target.value as never)} />
      )}
      {errors[id] && <div className="mr-field-err mt-1" role="alert">{errors[id]}</div>}
    </div>
  );

  return (
    <div className="mr-page" style={{ maxWidth: 980 }}>
      <h1 className="mr-title mb-1">New project</h1>
      <p className="mr-subtitle mb-3">Describe your idea and MobileRoad turns it into a roadmap you can review before anything is created.</p>

      <ol className="d-flex gap-2 list-unstyled mb-3 flex-wrap" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`badge ${i === stepIndex ? "text-bg-primary" : i < stepIndex ? "text-bg-success" : "text-bg-light border"}`} aria-current={i === stepIndex ? "step" : undefined}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      <div className="mr-card p-4">
        {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

        {step === "method" && (
          <div className="row g-3">
            {([
              ["form", "bi-ui-checks", "Guided form", "Answer a few questions about your business and app."],
              ["document", "bi-file-earmark-text", "Requirements document", "Upload or paste a PDF, DOCX, TXT or Markdown specification."],
            ] as const).map(([id, icon, title, text]) => (
              <div className="col-md-6" key={id}>
                <button type="button" className={`btn text-start w-100 p-3 border ${method === id ? "border-primary bg-primary-subtle" : "bg-white"}`} aria-pressed={method === id} onClick={() => setMethod(id)}>
                  <i className={`bi ${icon} fs-3 d-block mb-1`} aria-hidden="true" />
                  <span className="fw-bold d-block">{title}</span>
                  <span className="small text-muted">{text}</span>
                </button>
              </div>
            ))}
            <div className="col-12"><button type="button" className="btn btn-primary" onClick={() => setStep("details")}>Continue</button></div>
          </div>
        )}

        {step === "details" && (
          <>
            <div className="row">
              <div className="col-md-8">{field("name", "Project name *")}</div>
              <div className="col-md-4 mb-3">
                <label className="form-label small fw-semibold mb-1" htmlFor="w-platform">Platform</label>
                <select id="w-platform" className="form-select form-select-sm" value={form.platform} onChange={(e) => set("platform", e.target.value as Form["platform"])}>
                  <option value="both">iOS and Android</option><option value="ios">iOS</option><option value="android">Android</option><option value="cross-platform">Cross-platform</option>
                </select>
              </div>
            </div>

            {method === "form" ? (
              <>
                {field("description", "Business description *", { textarea: true, placeholder: "What does your business do and what should the app achieve?" })}
                {field("targetAudience", "Target audience", { placeholder: "Who will use the app?" })}
                {field("objectives", "Business objectives (one per line)", { textarea: true, rows: 3 })}
                {field("mainFeatures", "Main features (one per line)", { textarea: true, rows: 4, placeholder: "Users can browse products\nUsers can pay by card" })}
              </>
            ) : (
              <div className="mb-3">
                <label className="form-label small fw-semibold mb-1" htmlFor="w-file">Upload a document (PDF, DOCX, TXT, Markdown — max 4 MB)</label>
                <input id="w-file" type="file" className="form-control form-control-sm mb-2" accept=".pdf,.docx,.txt,.md,.markdown,.text" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
                {uploadNote && <div className={`alert py-2 ${uploadNote.ok ? "alert-success" : "alert-warning"}`} role="status">{uploadNote.text}</div>}
                {field("documentText", "Requirements text * (paste here, or edit the extracted text)", { textarea: true, rows: 12 })}
              </div>
            )}

            <div className="row">
              <div className="col-md-4">{field("techStack", "Preferred technology (optional)", { placeholder: "e.g. React Native" })}</div>
              <div className="col-md-2">{field("teamSize", "Team size", { type: "number" })}</div>
              <div className="col-md-3">{field("budget", "Budget (optional)", { placeholder: "e.g. 50,000 USD" })}</div>
              <div className="col-md-3">{field("launchDate", "Target launch (optional)", { type: "date" })}</div>
            </div>
            <div className="mb-3">
              <label className="form-label small fw-semibold mb-1" htmlFor="w-exp">Your technical experience</label>
              <select id="w-exp" className="form-select form-select-sm w-auto" value={form.experience} onChange={(e) => set("experience", e.target.value as ExperienceLevel)}>
                <option value="none">None — I am new to this</option><option value="some">Some</option><option value="experienced">Experienced</option>
              </select>
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setStep("method")}>Back</button>
              <button type="button" className="btn btn-primary" onClick={runAnalysis} disabled={busy !== null}>Analyze requirements</button>
            </div>
          </>
        )}

        {step === "review" && analysis && (
          <>
            <SourceNote source={analysis.source} warning={analysis.warning} />
            <div className="alert alert-info py-2 small">Review and correct what was extracted. <strong>Explicit</strong> items come from your text; <strong>inferred</strong> items are suggestions you can remove.</div>
            <div className="mb-3">
              <label className="form-label small fw-semibold mb-1" htmlFor="a-summary">Summary</label>
              <textarea id="a-summary" className="form-control form-control-sm" rows={2} value={analysis.data.summary} onChange={(e) => updateAnalysis({ summary: e.target.value })} />
            </div>
            <div className="row">
              <div className="col-lg-6">
                <EditableList label="Business objectives" items={analysis.data.businessObjectives} onChange={(businessObjectives) => updateAnalysis({ businessObjectives })} />
                <EditableList label="User roles" items={analysis.data.userRoles} onChange={(userRoles) => updateAnalysis({ userRoles })} />
                <EditableList
                  label="Functional requirements"
                  items={analysis.data.functionalRequirements.map((r) => r.text)}
                  badge={(i) => analysis.data.functionalRequirements[i]?.kind ?? "explicit"}
                  onChange={(texts) => updateAnalysis({ functionalRequirements: texts.map((text, i) => ({ text, kind: analysis.data.functionalRequirements[i]?.kind ?? "explicit" })) })}
                />
                <EditableList
                  label="Non-functional requirements"
                  items={analysis.data.nonFunctionalRequirements.map((r) => r.text)}
                  badge={(i) => analysis.data.nonFunctionalRequirements[i]?.kind ?? "explicit"}
                  onChange={(texts) => updateAnalysis({ nonFunctionalRequirements: texts.map((text, i) => ({ text, kind: analysis.data.nonFunctionalRequirements[i]?.kind ?? "explicit" })) })}
                />
                <EditableList label="Major features" items={analysis.data.majorFeatures} onChange={(majorFeatures) => updateAnalysis({ majorFeatures })} />
              </div>
              <div className="col-lg-6">
                <EditableList label="External integrations" items={analysis.data.externalIntegrations} onChange={(externalIntegrations) => updateAnalysis({ externalIntegrations })} />
                <EditableList label="Security requirements" items={analysis.data.securityRequirements} onChange={(securityRequirements) => updateAnalysis({ securityRequirements })} />
                <EditableList label="Assumptions" hint="Not confirmed by you — please verify." items={analysis.data.assumptions} onChange={(assumptions) => updateAnalysis({ assumptions })} />
                <EditableList label="Risks" items={analysis.data.risks} onChange={(risks) => updateAnalysis({ risks })} />
                <EditableList label="Missing information" items={analysis.data.missingInformation} onChange={(missingInformation) => updateAnalysis({ missingInformation })} />
                <EditableList label="Questions to clarify" items={analysis.data.questions} onChange={(questions) => updateAnalysis({ questions })} />
              </div>
            </div>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setStep("details")}>Back</button>
              <button type="button" className="btn btn-primary" onClick={runRoadmap} disabled={busy !== null}>Generate roadmap</button>
            </div>
          </>
        )}

        {step === "roadmap" && roadmap && (
          <>
            <SourceNote source={roadmap.source} warning={roadmap.warning} />
            <div className="mr-section-title mt-0">Phases ({roadmap.data.phases.length})</div>
            <div className="table-responsive mb-3">
              <table className="table table-sm align-middle mb-0">
                <thead><tr><th>#</th><th>Phase</th><th>Weeks</th><th>Key recommendation</th></tr></thead>
                <tbody>
                  {roadmap.data.phases.map((p, i) => (
                    <tr key={p.name}><td>{i + 1}</td><td className="fw-semibold">{p.name}<div className="small text-muted fw-normal">{p.objective}</div></td><td>{p.estimatedDurationWeeks}</td><td className="small">{p.keyRecommendation}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mr-section-title">Features — untick anything you do not want ({selected.size} of {roadmap.data.features.length} selected)</div>
            {featuresByGroup.map(([group, items]) => (
              <div key={group} className="mb-2">
                <div className="fw-semibold small text-uppercase text-muted">{group}</div>
                {items.map((f) => (
                  <label key={f.index} className="d-flex gap-2 border rounded p-2 mb-1" style={{ cursor: "pointer" }}>
                    <input type="checkbox" className="form-check-input mt-1" checked={selected.has(f.index)} onChange={(e) => setSelected((prev) => { const n = new Set(prev); if (e.target.checked) n.add(f.index); else n.delete(f.index); return n; })} />
                    <span><span className="fw-semibold">{f.name}</span> <span className="badge text-bg-light border text-capitalize">{f.priority}</span> <span className="small text-muted">~{f.days} days</span><span className="d-block small text-muted">{f.description}</span></span>
                  </label>
                ))}
              </div>
            ))}
            <div className="row align-items-end mt-3">
              <div className="col-md-4">
                <label className="form-label small fw-semibold mb-1" htmlFor="w-start">Project start date</label>
                <input id="w-start" type="date" className="form-control form-control-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            </div>
            <div className="d-flex gap-2 mt-3">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setStep("review")}>Back</button>
              <button type="button" className="btn btn-success" onClick={create} disabled={selected.size === 0}>Create project</button>
            </div>
            <div className="small text-muted mt-2">Every feature starts as “Not Started”. You can edit, reschedule and track everything afterwards.</div>
          </>
        )}

        {busy && <div className="text-muted mt-3" role="status"><span className="spinner-border spinner-border-sm me-2" />{busy}</div>}
      </div>
    </div>
  );
}
