import type { MarkerKey } from "./types";

/** Base duration in days of each stage: design, development, QA, UAT, staging. */
export const STAGE_DAYS = [12, 30, 10, 7, 7];
export const MARKER_ORDER: MarkerKey[] = ["kickoff", "design", "dev", "qa", "uat", "production"];

export const STAGE_CHECKPOINTS = [
  { name: "UX flows and wireframes approved", description: "Screens and user flows reviewed with the product owner.", criteria: ["Wireframes reviewed", "Edge cases listed"] },
  { name: "Implementation complete and reviewed", description: "Code finished, peer reviewed and merged.", criteria: ["Code review approved", "Unit tests passing"] },
  { name: "QA test cases passed", description: "Functional and integration tests executed with no critical defects.", criteria: ["No open critical bugs", "Regression suite green"] },
  { name: "Stakeholder sign-off (UAT)", description: "Business stakeholders verified the feature against acceptance criteria.", criteria: ["Acceptance criteria verified", "Approval documented"] },
  { name: "Release candidate verified in staging", description: "Feature validated in a production-like environment.", criteria: ["Deployment tested", "Configuration verified"] },
  { name: "Live and monitored", description: "Feature released and monitoring confirms it is healthy.", criteria: ["Release approved", "Monitoring configured"] },
];

