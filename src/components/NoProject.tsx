import Link from "next/link";

export function NoProject() {
  return (
    <div className="mr-page">
      <div className="mr-card p-5 text-center">
        <h1 className="h4">No project is open</h1>
        <p className="text-muted">Create a project from your idea, or open one from the projects list.</p>
        <div className="d-flex gap-2 justify-content-center">
          <Link href="/projects/new" className="btn btn-primary">New project</Link>
          <Link href="/projects" className="btn btn-outline-secondary">All projects</Link>
        </div>
      </div>
    </div>
  );
}
