import type { Metadata } from "next";
import { PhasesView } from "@/components/PhasesView";

export const metadata: Metadata = {
  title: "Phases guide",
  description:
    "A plain-language guide to every phase of building a mobile app: discovery, design, architecture, development, QA, UAT, staging, store launch and support.",
  openGraph: { title: "Phases guide — MobileRoad", url: "./" },
};

export default function PhasesPage() {
  return <PhasesView />;
}
