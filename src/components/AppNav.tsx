"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AiPanel } from "./AiPanel";
import { APP_NAME, APP_TAGLINE } from "@/config";
import { useProject } from "@/state/ProjectProvider";

const TABS = [
  { href: "/", label: "Roadmap", icon: "bi-bar-chart-steps" },
  { href: "/phases", label: "Phases guide", icon: "bi-signpost-split" },
  { href: "/projects", label: "Projects", icon: "bi-folder2-open" },
];

export function AppNav() {
  const pathname = usePathname();
  const { project } = useProject();
  const [aiOpen, setAiOpen] = useState(false);
  return (
    <header className="mr-nav">
      <nav className="mr-nav-inner" aria-label="Main">
        <Link href="/" className="mr-brand">
          <span className="mr-brand-logo" aria-hidden="true"><i className="bi bi-signpost-2-fill" /></span>
          <span>
            <span className="mr-brand-name d-block">{APP_NAME}</span>
            <span className="mr-brand-tag d-block">{APP_TAGLINE}</span>
          </span>
        </Link>
        <div className="mr-tabs">
          {TABS.map((tab) => {
            const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link key={tab.href} href={tab.href} className={`mr-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
                <i className={`bi ${tab.icon}`} aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </div>
        <div className="mr-nav-right">
          {project?.isDemo && <span className="mr-demo-pill">DEMO DATA</span>}
          {project && !project.isDemo && <span className="small text-muted d-none d-md-inline text-truncate" style={{ maxWidth: 220 }} title={project.name}>{project.name}</span>}
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setAiOpen(true)} disabled={!project} title={project ? undefined : "Open a project to use the advisor"}>
            <i className="bi bi-stars me-1" aria-hidden="true" />AI Advisor
          </button>
        </div>
      </nav>
      {aiOpen && <AiPanel onClose={() => setAiOpen(false)} />}
    </header>
  );
}
