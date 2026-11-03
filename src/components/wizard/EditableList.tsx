"use client";

interface Props {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  hint?: string;
  /** Optional per-row badge, e.g. explicit / inferred. */
  badge?: (index: number) => string | null;
  addLabel?: string;
}

export function EditableList({ label, items, onChange, hint, badge, addLabel = "Add" }: Props) {
  const set = (i: number, value: string) => onChange(items.map((x, idx) => (idx === i ? value : x)));
  return (
    <fieldset className="mb-3">
      <legend className="mr-section-title mt-0 mb-1 float-none w-auto">{label}</legend>
      {hint && <div className="small text-muted mb-1">{hint}</div>}
      {items.length === 0 && <div className="small text-muted fst-italic mb-1">Nothing listed.</div>}
      {items.map((item, i) => {
        const tag = badge?.(i);
        return (
          <div className="input-group input-group-sm mb-1" key={i}>
            {tag && <span className={`input-group-text ${tag === "inferred" ? "text-warning-emphasis" : "text-success"}`}>{tag}</span>}
            <input className="form-control" aria-label={`${label} ${i + 1}`} value={item} onChange={(e) => set(i, e.target.value)} />
            <button type="button" className="btn btn-outline-secondary" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-sm btn-link px-0" onClick={() => onChange([...items, ""])}>
        <i className="bi bi-plus-lg me-1" aria-hidden="true" />{addLabel}
      </button>
    </fieldset>
  );
}
