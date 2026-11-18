import type { Metadata } from "next";
import { ProjectWizard } from "@/components/wizard/ProjectWizard";

// Private working view: not meant to appear in search results.
export const metadata: Metadata = { title: "New project", robots: { index: false, follow: false } };

export default function NewProjectPage() {
  return <ProjectWizard />;
}
