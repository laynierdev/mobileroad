import type { FeatureStatus, MarkerKey } from "./types";

export interface StatusMeta {
  key: FeatureStatus;
  code: string;
  label: string;
  caption: string;
  color: string;
}

export const STATUS_ORDER: FeatureStatus[] = [
  "not_started",
  "design",
  "development",
  "qa",
  "uat",
  "staging",
  "production",
];

export const STATUS_META: Record<FeatureStatus, StatusMeta> = {
  not_started: { key: "not_started", code: "NS", label: "Not Started", caption: "Pending kickoff", color: "#bcc2cf" },
  design: { key: "design", code: "UX", label: "In Design", caption: "UX/UI design phase", color: "#6b4fbb" },
  development: { key: "development", code: "DEV", label: "In Development", caption: "Active development", color: "#0f95b0" },
  qa: { key: "qa", code: "QA", label: "Under QA", caption: "Quality assurance testing", color: "#f5a509" },
  uat: { key: "uat", code: "UAT", label: "Under UAT", caption: "User acceptance testing", color: "#2dbf7a" },
  staging: { key: "staging", code: "STG", label: "In Staging", caption: "Staging environment", color: "#1668f0" },
  production: { key: "production", code: "PRD", label: "In Production", caption: "Live in production", color: "#0f9d84" },
};

export interface MarkerMeta {
  key: MarkerKey;
  code: string;
  /** Title used on milestone cards ("Next <title>"). */
  title: string;
  subtitle: string;
  color: string;
}

export const MARKERS: MarkerMeta[] = [
  { key: "kickoff", code: "GO", title: "Start", subtitle: "Project Kickoff", color: "#6b4fbb" },
  { key: "design", code: "M0", title: "Design Approved", subtitle: "UX/UI Sign-off", color: "#0f95b0" },
  { key: "dev", code: "M1", title: "Dev Complete", subtitle: "Code Ready", color: "#f5a509" },
  { key: "qa", code: "M2", title: "QA Passed", subtitle: "Testing Done", color: "#2dbf7a" },
  { key: "uat", code: "M3", title: "UAT Approved", subtitle: "Business Sign-off", color: "#1668f0" },
  { key: "production", code: "M4", title: "Production", subtitle: "Live in Prod", color: "#0f9d84" },
];

/** Colour of the bar segment between consecutive markers (design, development, QA, UAT, staging). */
export const SEGMENT_COLORS: string[] = ["#6b4fbb", "#0f95b0", "#f5a509", "#2dbf7a", "#1668f0"];
