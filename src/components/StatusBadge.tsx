import { STATUS_META } from "@/domain/status";
import type { FeatureStatus } from "@/domain/types";

export function StatusBadge({ status, label = false }: { status: FeatureStatus; label?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span className={`mr-code${status === "not_started" ? " ns" : ""}`} style={{ background: meta.color }} title={meta.label}>
      {label ? meta.label : meta.code}
    </span>
  );
}
