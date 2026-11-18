import type { Metadata } from "next";
import { ProjectsView } from "@/components/ProjectsView";

// Private view: it lists the visitor's own projects. Left crawlable (not in robots.txt) so the noindex is seen.
export const metadata: Metadata = { title: "Projects", robots: { index: false, follow: false } };

export default function ProjectsPage() {
  return <ProjectsView />;
}
