import { STATUS_META, STATUS_ORDER } from "@/domain/status";
import type { StatusCounts } from "@/domain/roadmap";

interface Props {
  total: number;
  counts: StatusCounts;
  productionPercent: number;
}

export function OverallProgress({ total, counts, productionPercent }: Props) {
  return (
    <section className="mr-card p-4" aria-label="Overall progress">
      <div className="mr-progress-head mb-3">
        <h2>Overall Progress (All {total} Features)</h2>
        <span className="mr-progress-pct">{productionPercent}% In Production</span>
      </div>
      <div className="mr-bar" role="img" aria-label={STATUS_ORDER.map((s) => `${counts[s]} ${STATUS_META[s].label}`).join(", ")}>
        {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <div
            key={s}
            className={`mr-bar-seg${s === "not_started" ? " ns" : ""}`}
            style={{ flexGrow: counts[s], flexBasis: 0, background: STATUS_META[s].color }}
            title={`${STATUS_META[s].label}: ${counts[s]}`}
          >
            {counts[s]}
          </div>
        ))}
      </div>
      <div className="mr-legend-dots mt-3">
        {STATUS_ORDER.map((s) => (
          <span key={s}>
            <span className="mr-dot" style={{ background: STATUS_META[s].color }} />
            {STATUS_META[s].code} {STATUS_META[s].label}
          </span>
        ))}
      </div>
    </section>
  );
}
