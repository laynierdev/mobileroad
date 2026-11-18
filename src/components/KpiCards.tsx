import { STATUS_META, STATUS_ORDER } from "@/domain/status";
import type { StatusCounts } from "@/domain/roadmap";
import type { FeatureStatus } from "@/domain/types";

interface Props {
  total: number;
  shown: number;
  counts: StatusCounts;
  filter: FeatureStatus | null;
  onFilter: (status: FeatureStatus | null) => void;
}

export function KpiCards({ total, shown, counts, filter, onFilter }: Props) {
  return (
    <div className="mr-kpis" role="group" aria-label="Filter timeline by status">
      <button type="button" className={`mr-kpi total${filter === null ? " active" : ""}`} onClick={() => onFilter(null)} aria-pressed={filter === null}>
        <div className="num">{total}</div>
        <div className="lbl">Total features</div>
        <div className="cap">in project scope</div>
        <div className="sub">{shown} shown + {total - shown} hidden</div>
      </button>
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const active = filter === status;
        return (
          <button
            key={status}
            type="button"
            className={`mr-kpi${active ? " active" : ""}${status === "not_started" ? " ns" : ""}`}
            style={{ ["--c" as string]: meta.color }}
            onClick={() => onFilter(active ? null : status)}
            aria-pressed={active}
          >
            <div className="num">{counts[status]}</div>
            <div className="lbl">{meta.label}</div>
            <div className="cap">{meta.caption}</div>
          </button>
        );
      })}
    </div>
  );
}
