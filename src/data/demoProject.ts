import { addDays, toIso } from "@/domain/roadmap";
import { STATUS_ORDER } from "@/domain/status";
import { MARKER_ORDER, STAGE_CHECKPOINTS, STAGE_DAYS } from "@/domain/stages";
import type { Checkpoint, Feature, FeatureRisk, FeatureStatus, MarkerKey, Phase, Priority, Project } from "@/domain/types";

const PROJECT_ID = "demo-ecommerce";

const GROUPS = [
  { id: "analytics", name: "Analytics", order: 1 },
  { id: "backend", name: "Backend Services", order: 2 },
  { id: "auth", name: "Authentication", order: 3 },
  { id: "ux", name: "UI/UX", order: 4 },
  { id: "mobile", name: "Mobile Application", order: 5 },
  { id: "infra", name: "Infrastructure", order: 6 },
  { id: "testing", name: "Testing", order: 7 },
  { id: "deploy", name: "Deployment", order: 8 },
];

interface Seed {
  name: string;
  group: string;
  status: FeatureStatus;
  description: string;
  priority?: Priority;
  /** 0.6 small, 1 medium, 1.5 large. */
  size?: number;
  /** How far through the current stage the feature is (0..1), or days from today for not-started work. */
  progress?: number;
  startIn?: number;
  deps?: string[];
  risk?: FeatureRisk;
  notes?: string;
}

const SEEDS: Seed[] = [
  { name: "Sales Dashboard", group: "analytics", status: "not_started", startIn: 85, size: 1.2, description: "Revenue, conversion and order metrics for the business team.", deps: ["Order Management API"] },
  { name: "Customer Analytics", group: "analytics", status: "not_started", startIn: 150, description: "Customer segments, retention and lifetime value reports.", deps: ["Sales Dashboard"] },
  { name: "A/B Testing Platform", group: "analytics", status: "not_started", startIn: 215, size: 1.5, description: "Run experiments on checkout and product pages.", deps: ["Customer Analytics"] },

  { name: "Database Schema v1", group: "backend", status: "production", size: 0.6, progress: 0.2, priority: "critical", description: "Core relational schema for users, products and orders.", notes: "Live since the first sprint. Migrations are handled with versioned scripts." },
  { name: "Product Service API", group: "backend", status: "qa", progress: 0.5, priority: "high", description: "REST API to manage and query the product catalog.", deps: ["Database Schema v1"], risk: { level: "medium", description: "Performance on large catalogs is not validated yet.", mitigation: "Add pagination and run a load test before UAT." } },
  { name: "Email Notification Service", group: "backend", status: "development", progress: 0.4, description: "Transactional emails: order confirmation, shipping updates.", deps: ["Database Schema v1"] },
  { name: "Inventory Service", group: "backend", status: "development", progress: 0.7, priority: "high", description: "Stock levels, reservations and low-stock alerts.", deps: ["Database Schema v1"] },
  { name: "Order Management API", group: "backend", status: "development", progress: 0.3, size: 1.5, priority: "critical", description: "Create, update and track orders across their lifecycle.", deps: ["Inventory Service", "Product Service API"], risk: { level: "high", description: "Depends on two services that are still in progress.", mitigation: "Freeze the API contract now and use contract tests." } },
  { name: "Product Search API", group: "backend", status: "design", progress: 0.4, description: "Full-text search with filters and ranking.", deps: ["Product Service API"] },
  { name: "Payment Gateway Integration", group: "backend", status: "not_started", startIn: 30, size: 1.5, priority: "critical", description: "Card and wallet payments through an external provider.", deps: ["Order Management API"], risk: { level: "high", description: "Provider onboarding and PCI requirements may take longer than planned.", mitigation: "Start the provider approval process immediately." } },
  { name: "Shipping Rates Service", group: "backend", status: "not_started", startIn: 55, description: "Shipping options and cost calculation by destination.", deps: ["Order Management API"] },
  { name: "Coupon & Promotions Engine", group: "backend", status: "not_started", startIn: 75, description: "Discount codes and promotional rules.", deps: ["Order Management API"] },
  { name: "Review & Rating API", group: "backend", status: "not_started", startIn: 100, size: 0.6, description: "Customer reviews with moderation.", deps: ["Product Service API"] },
  { name: "Wishlist Service", group: "backend", status: "not_started", startIn: 120, size: 0.6, description: "Save products for later.", deps: ["Product Service API"] },
  { name: "Admin Backoffice API", group: "backend", status: "not_started", startIn: 140, description: "Operations endpoints for staff users.", deps: ["Order Management API"] },

  { name: "User Authentication (OAuth2)", group: "auth", status: "development", progress: 0.6, priority: "critical", description: "Sign-in with email and social providers using OAuth2.", deps: ["Database Schema v1"] },
  { name: "Password Reset Flow", group: "auth", status: "staging", progress: 0.5, size: 0.6, description: "Secure reset via email link.", deps: ["Email Notification Service"] },
  { name: "Biometric Login", group: "auth", status: "not_started", startIn: 45, size: 0.6, description: "Face ID / fingerprint sign-in on supported devices.", deps: ["User Authentication (OAuth2)"] },
  { name: "Role-based Access Control", group: "auth", status: "not_started", startIn: 90, description: "Customer, staff and admin permissions.", deps: ["User Authentication (OAuth2)"] },

  { name: "Design System", group: "ux", status: "production", size: 0.6, progress: 0.5, description: "Colors, typography and reusable components.", notes: "Shared Figma library published to the whole team." },
  { name: "Checkout Flow", group: "ux", status: "design", progress: 0.8, priority: "high", description: "Cart-to-payment journey, optimized for one hand use.", risk: { level: "medium", description: "Design approval is close to its deadline.", mitigation: "Schedule a sign-off review this week." } },
  { name: "Onboarding Screens", group: "ux", status: "design", progress: 0.3, size: 0.6, description: "First-launch walkthrough and permissions priming." },
  { name: "Product Detail Page", group: "ux", status: "uat", progress: 0.4, size: 0.6, description: "Gallery, variants, reviews and call to action.", deps: ["Design System"] },
  { name: "Accessibility Audit", group: "ux", status: "not_started", startIn: 60, size: 0.6, description: "Screen reader, contrast and touch target review." },
  { name: "Localization Screens", group: "ux", status: "not_started", startIn: 110, size: 0.6, description: "Language and currency selection and RTL checks." },

  { name: "Product Catalog Browse", group: "mobile", status: "uat", progress: 0.6, priority: "high", description: "Browse categories and product lists.", deps: ["Product Service API"] },
  { name: "Shopping Cart", group: "mobile", status: "qa", progress: 0.3, priority: "high", description: "Add, edit and persist cart items.", deps: ["Product Service API"] },
  { name: "Push Notifications", group: "mobile", status: "development", progress: 0.2, description: "Order updates and promotions via push.", deps: ["Email Notification Service"] },
  { name: "User Profile", group: "mobile", status: "development", progress: 0.5, size: 0.6, description: "Addresses, preferences and order history.", deps: ["User Authentication (OAuth2)"] },
  { name: "Deep Linking", group: "mobile", status: "design", progress: 0.6, size: 0.6, description: "Open products and orders from external links." },
  { name: "Order Tracking", group: "mobile", status: "not_started", startIn: 70, description: "Live status of shipments.", deps: ["Order Management API"] },
  { name: "Offline Mode", group: "mobile", status: "not_started", startIn: 105, size: 1.5, description: "Browse the catalog and cart without connectivity." },
  { name: "Wishlist Screen", group: "mobile", status: "not_started", startIn: 130, size: 0.6, description: "Saved items UI.", deps: ["Wishlist Service"] },
  { name: "In-App Reviews", group: "mobile", status: "not_started", startIn: 160, size: 0.6, description: "Write and read product reviews.", deps: ["Review & Rating API"] },

  { name: "AWS Infrastructure Setup", group: "infra", status: "staging", progress: 0.4, priority: "high", description: "Cloud accounts, networking, environments and IaC.", notes: "Production account is ready; waiting on final cost review." },
  { name: "CI/CD Pipeline", group: "infra", status: "staging", progress: 0.7, priority: "high", description: "Automatic build, test and release for the app and backend." },
  { name: "Secrets Management", group: "infra", status: "production", size: 0.6, progress: 0.6, description: "Central vault for API keys and credentials." },
  { name: "Observability & Logging", group: "infra", status: "qa", progress: 0.8, size: 0.6, description: "Logs, metrics and alerting dashboards." },
  { name: "CDN & Media Storage", group: "infra", status: "not_started", startIn: 40, size: 0.6, description: "Fast delivery of product images.", deps: ["AWS Infrastructure Setup"] },

  { name: "E2E Test Suite", group: "testing", status: "qa", progress: 0.2, description: "Automated end-to-end journeys on real devices.", deps: ["Shopping Cart"] },
  { name: "Load Testing", group: "testing", status: "not_started", startIn: 95, size: 0.6, description: "Verify performance for launch traffic.", deps: ["Order Management API"] },
  { name: "Security Penetration Test", group: "testing", status: "not_started", startIn: 125, description: "External review of the API and the app." },
  { name: "Device Compatibility Matrix", group: "testing", status: "not_started", startIn: 145, size: 0.6, description: "Verify supported iOS and Android versions." },

  { name: "App Store Submission", group: "deploy", status: "not_started", startIn: 170, size: 0.6, priority: "high", description: "Metadata, screenshots, privacy labels and review." },
  { name: "Google Play Submission", group: "deploy", status: "not_started", startIn: 175, size: 0.6, priority: "high", description: "Store listing, data safety form and staged rollout." },
  { name: "Release Monitoring", group: "deploy", status: "not_started", startIn: 200, size: 0.6, description: "Crash reporting and launch dashboards." },
];

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildFeature(seed: Seed, today: Date): Feature {
  const size = seed.size ?? 1;
  const durations = STAGE_DAYS.map((d) => Math.max(3, Math.round(d * size)));
  const statusIndex = STATUS_ORDER.indexOf(seed.status);
  let startOffset: number;
  if (seed.status === "not_started") {
    startOffset = seed.startIn ?? 30;
  } else if (seed.status === "production") {
    const total = durations.reduce((a, b) => a + b, 0);
    startOffset = -(total + Math.round((seed.progress ?? 0.2) * 30));
  } else {
    const before = durations.slice(0, statusIndex - 1).reduce((a, b) => a + b, 0);
    startOffset = -(before + Math.round((seed.progress ?? 0.5) * durations[statusIndex - 1]));
  }

  const start = addDays(today, startOffset);
  const dates = [start];
  let acc = 0;
  for (const d of durations) {
    acc += d;
    dates.push(addDays(start, acc));
  }
  const schedule = Object.fromEntries(MARKER_ORDER.map((k, i) => [k, toIso(dates[i])])) as Record<MarkerKey, string>;

  const id = slug(seed.name);
  const checkpoints: Checkpoint[] = STAGE_CHECKPOINTS.map((c, i) => {
    const completed = seed.status === "production" || i < statusIndex - 1;
    return {
      id: `${id}-cp${i}`,
      name: c.name,
      description: c.description,
      completed,
      completedAt: completed ? schedule[MARKER_ORDER[Math.min(i + 1, 5)]] : undefined,
      acceptanceCriteria: c.criteria,
    };
  });

  return {
    id,
    projectId: PROJECT_ID,
    phaseId: `phase-${seed.status}`,
    groupId: seed.group,
    name: seed.name,
    description: seed.description,
    status: seed.status,
    priority: seed.priority ?? "medium",
    schedule,
    dependencies: (seed.deps ?? []).map(slug),
    checkpoints,
    notes: seed.notes ?? "",
    risk: seed.risk,
  };
}

const PHASES: Omit<Phase, "projectId">[] = [
  {
    id: "phase-discovery", name: "Discovery", order: 1,
    description: "Understand the business, the users and the scope of the first release.",
    meaning: "Discovery is where you write down what the app should do and for whom, before anyone designs or builds anything.",
    whyItMatters: "Most failed apps fail because the goal was unclear. A few days here saves months later.",
    whatYouDo: ["Describe your business goals in plain words", "List who will use the app and what they need", "Decide what the smallest useful first version (MVP) is"],
    successLooksLike: "A one-page scope that you, your team and your developers all agree on.",
    commonMistakes: ["Trying to include every idea in version 1", "Skipping the target audience"],
    whatsNext: "A designer turns the scope into screens and user flows.",
    checkpoints: ["Business goals documented", "Target audience defined", "Main user journeys identified", "Initial scope agreed upon", "MVP defined"],
    deliverables: ["Requirements summary", "MVP scope"],
    technicalDetails: "Produce a PRD with user stories, non-functional requirements and an initial risk register.",
  },
  {
    id: "phase-design", name: "UX/UI Design", order: 2, featureStatus: "design",
    description: "Design the flows and screens people will actually touch.",
    meaning: "Designers draw every screen and the paths between them, then turn them into a clickable prototype.",
    whyItMatters: "Changing a drawing costs minutes; changing finished code costs days.",
    whatYouDo: ["Review wireframes and give clear feedback", "Test the prototype with a few real users", "Approve the final design"],
    successLooksLike: "An approved prototype and a design system developers can reuse.",
    commonMistakes: ["Approving designs without testing them with users", "Ignoring accessibility"],
    whatsNext: "Engineers choose the architecture that will support the approved design.",
    checkpoints: ["User flows created", "Wireframes reviewed", "UI prototype approved", "Design system established", "Accessibility considered"],
    deliverables: ["Clickable prototype", "Design system"],
    technicalDetails: "Component library in Figma with design tokens mapped to the chosen mobile UI toolkit.",
  },
  {
    id: "phase-architecture", name: "Architecture", order: 3,
    description: "Choose the technology and plan how the pieces fit together.",
    meaning: "The technical blueprint: which technologies are used, where data lives and how the app talks to the server.",
    whyItMatters: "A good blueprint keeps the app fast, secure and affordable to change.",
    whatYouDo: ["Ask your developers to explain their choices in plain language", "Confirm security and budget implications"],
    successLooksLike: "Documented decisions about frontend, backend, database, authentication and APIs.",
    commonMistakes: ["Choosing trendy tech with no one to maintain it", "Deferring security decisions"],
    whatsNext: "Development starts on the agreed foundation.",
    checkpoints: ["Frontend architecture selected", "Backend architecture selected", "Database design reviewed", "Authentication strategy defined", "API contracts documented", "Security requirements identified"],
    deliverables: ["Architecture document", "API contracts"],
    technicalDetails: "ADRs, C4 diagrams, OpenAPI specs, threat model and environment strategy.",
  },
  {
    id: "phase-development", name: "Development", order: 4, featureStatus: "development",
    description: "Build the app and its backend in short iterations.",
    meaning: "Developers write the code, usually in two-week sprints, showing working progress each time.",
    whyItMatters: "Frequent demos let you catch misunderstandings early.",
    whatYouDo: ["Join sprint demos", "Answer questions quickly", "Resist adding new scope mid-sprint"],
    successLooksLike: "Core features work end to end on test devices.",
    commonMistakes: ["No demo cadence", "Unmanaged scope changes"],
    whatsNext: "QA tests everything that was built.",
    checkpoints: ["Development environment configured", "Repository established", "CI/CD strategy defined", "Core functionality implemented", "Integrations implemented", "Error handling implemented"],
    deliverables: ["Working builds", "Automated pipeline"],
    technicalDetails: "Trunk-based development, code review, unit tests and an automated build for every commit.",
  },
  {
    id: "phase-qa", name: "Quality Assurance", order: 5, featureStatus: "qa",
    description: "Systematically look for bugs, security and performance problems.",
    meaning: "Testers try to break the app so your customers do not.",
    whyItMatters: "App store reviews punish crashes quickly and are slow to recover.",
    whatYouDo: ["Review the bug list and prioritize severity", "Make sure critical bugs block the release"],
    successLooksLike: "No critical defects and a green regression test suite.",
    commonMistakes: ["Testing only on one phone", "Fixing bugs without retesting"],
    whatsNext: "Business stakeholders try the app in UAT.",
    checkpoints: ["Functional tests completed", "Integration tests completed", "Security checks completed", "Performance tests completed where appropriate", "Critical defects resolved"],
    deliverables: ["Test report", "Defect log"],
    technicalDetails: "Pyramid of unit, integration and E2E tests; device farm runs; dependency and OWASP MASVS checks.",
  },
  {
    id: "phase-uat", name: "User Acceptance Testing", order: 6, featureStatus: "uat",
    description: "Business users confirm the app does what was agreed.",
    meaning: "The people who asked for the app test it against the agreed acceptance criteria.",
    whyItMatters: "It is the formal moment where the business says: this is what we wanted.",
    whatYouDo: ["Run through the main journeys yourself", "Collect feedback from a small group of real users", "Sign off in writing"],
    successLooksLike: "Documented approval of the release candidate.",
    commonMistakes: ["Giving vague feedback", "Introducing new requirements during UAT"],
    whatsNext: "The approved build is deployed to staging.",
    checkpoints: ["Business stakeholders review functionality", "Acceptance criteria verified", "User feedback collected", "Approval documented"],
    deliverables: ["Signed UAT approval"],
    technicalDetails: "UAT on a TestFlight / internal track build against a staging backend with realistic data.",
  },
  {
    id: "phase-staging", name: "Staging", order: 7, featureStatus: "staging",
    description: "Rehearse the real release in a production-like environment.",
    meaning: "A dress rehearsal: the same setup as the real thing, but with no real customers.",
    whyItMatters: "It exposes configuration problems before they reach customers.",
    whatYouDo: ["Confirm the release candidate", "Approve go-live timing"],
    successLooksLike: "A release candidate that deploys cleanly and passes smoke tests.",
    commonMistakes: ["Staging that differs from production", "Untested database migrations"],
    whatsNext: "Release to production and stores.",
    checkpoints: ["Staging environment configured", "Production-like configuration verified", "Database migrations validated", "Deployment process tested", "Release candidate approved"],
    deliverables: ["Release candidate", "Rollback plan"],
    technicalDetails: "Infrastructure as code parity, migration dry runs and a documented rollback.",
  },
  {
    id: "phase-production", name: "Production Launch", order: 8, featureStatus: "production",
    description: "Publish to the App Store and Google Play and go live.",
    meaning: "The app is released to real users through Apple and Google store reviews.",
    whyItMatters: "Store reviews take days and can reject apps for missing privacy or legal items.",
    whatYouDo: ["Prepare store listing and screenshots", "Publish a privacy policy", "Approve the final release"],
    successLooksLike: "The app is live and monitoring is active.",
    commonMistakes: ["Submitting at the last minute", "Missing privacy declarations"],
    whatsNext: "Support and maintenance start.",
    checkpoints: ["Production environment configured", "App Store and Google Play requirements reviewed", "Privacy policy and legal requirements addressed", "Application submitted for review", "Release approved", "Monitoring configured"],
    deliverables: ["Store listings", "Release notes"],
    technicalDetails: "Staged rollouts, signing keys, store compliance and release-health dashboards.",
  },
  {
    id: "phase-support", name: "Support & Maintenance", order: 9,
    description: "Keep the app healthy, secure and improving after launch.",
    meaning: "After launch the work continues: fixing issues, updating for new OS versions and listening to users.",
    whyItMatters: "Apps that are not maintained decay quickly and lose their ratings.",
    whatYouDo: ["Review crash and feedback reports regularly", "Budget for ongoing maintenance"],
    successLooksLike: "Crashes are tracked, users can reach you, and updates ship regularly.",
    commonMistakes: ["No owner for support", "No budget after launch"],
    whatsNext: "Plan version 2 based on real usage data.",
    checkpoints: ["Crash reporting configured", "Logging established", "User feedback channel established", "Support responsibilities defined", "Update strategy documented", "Maintenance plan established"],
    deliverables: ["Support runbook", "Maintenance plan"],
    technicalDetails: "Crash analytics, alerting, SLOs and a yearly OS-compatibility upgrade cycle.",
  },
];

export function buildDemoProject(today: Date = new Date()): Project {
  return {
    id: PROJECT_ID,
    name: "E-Commerce Mobile Platform",
    description: "Demo project: a shopping app for iOS and Android with a cloud backend. Used to explore MobileRoad.",
    platform: "both",
    targetAudience: "Online shoppers aged 22-45 who buy mostly from their phone.",
    businessGoals: ["Launch a mobile storefront in 12 months", "Reach 10% repeat purchase rate", "Reduce checkout abandonment"],
    techStack: "React Native, Node.js, PostgreSQL, AWS",
    targetLaunchDate: toIso(addDays(today, 240)),
    isDemo: true,
    groups: GROUPS,
    phases: PHASES.map((p) => ({ ...p, projectId: PROJECT_ID })),
    features: SEEDS.map((s) => buildFeature(s, today)),
  };
}
