import { formatDate, type MilestoneCard } from "@/domain/roadmap";

export function MilestoneCards({ milestones }: { milestones: MilestoneCard[] }) {
  return (
    <section className="mr-milestones" aria-label="Upcoming milestones">
      {milestones.map((m) => (
        <article key={m.key} className="mr-card mr-ms">
          <div className="mr-ms-top">
            <span className="mr-ms-badge" style={{ background: m.color }}>{m.code}</span>
            <div>
              <div className="mr-ms-title"><small>{m.completed ? "Last" : "Next"}</small>{m.title}</div>
              <div className="mr-ms-sub">{m.subtitle}</div>
            </div>
          </div>
          <div className="mr-ms-body">
            {m.date ? (
              <>
                <strong>{formatDate(m.date)}</strong> - {m.featureName}
                {m.warning && <i className="bi bi-exclamation-triangle-fill text-warning ms-2" title="This feature is at risk" aria-label="At risk" />}
                {m.completed && <div className="mr-ms-done mt-1"><i className="bi bi-check-circle-fill me-1" />All features past this milestone</div>}
              </>
            ) : (
              <span className="text-muted">No dates scheduled</span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
