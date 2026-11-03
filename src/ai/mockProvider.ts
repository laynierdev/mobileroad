import { countAtRisk, countByStatus, isAtRisk, isOverdue, parseDate, productionPercent, toIso } from "@/domain/roadmap";
import { STATUS_META, STATUS_ORDER } from "@/domain/status";
import type { Feature, Project } from "@/domain/types";
import type { AiProvider } from "./provider";
import type { AuditResult, ScopeImpactResult } from "./schemas";

/** Offline provider: derives answers from the project data with simple rules. No network, no API key. */
const STOP = new Set(["the", "and", "for", "with", "that", "this", "client", "wants", "want", "add", "new", "from", "have", "should", "would", "into", "about", "real", "time", "feature", "features", "support"]);

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
const idx = (f: Feature) => STATUS_ORDER.indexOf(f.status);

function nextCheckpoint(f: Feature) {
  return f.checkpoints.find((c) => !c.completed);
}

function activeFeatures(project: Project): Feature[] {
  const weight = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  return project.features
    .filter((f) => f.status !== "production" && f.status !== "not_started")
    .sort((a, b) => weight[a.priority] - weight[b.priority] || idx(b) - idx(a));
}

function notReady(project: Project, today: Date) {
  const counts = countByStatus(project.features);
  const remaining = project.features.length - counts.production;
  return { remaining, atRisk: countAtRisk(project.features, today), percent: productionPercent(project.features) };
}

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mockProvider: AiProvider = {
  name: "mock",

  async analyzeRequirements({ text, projectName }) {
    const header = /^(project|platform|preferred technology|team size|budget|target launch|technical experience|description|target audience|business objectives|main features):/i;
    const lines = text.split(/\n|(?<=[.!?])\s+/).map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim()).filter((l) => l.length > 8 && !header.test(l));
    const explicit = lines.filter((l) => /\b(must|should|need|needs|want|wants|allow|allows|can|enable|support)\b/i.test(l)).slice(0, 12);
    const lower = text.toLowerCase();
    const has = (re: RegExp) => re.test(lower);
    const roles = ["admin", "customer", "user", "manager", "driver", "seller", "vendor", "buyer", "student", "teacher", "patient", "doctor"].filter((r) => lower.includes(r));
    const integrations = [
      has(/pay|stripe|checkout|card/) && "Payment provider",
      has(/map|location|gps|delivery/) && "Maps / location services",
      has(/push|notification/) && "Push notification service",
      has(/email|newsletter/) && "Email delivery service",
      has(/analytics|metrics|dashboard/) && "Analytics platform",
      has(/login|sign in|account|social/) && "Identity / sign-in provider",
    ].filter((x): x is string => Boolean(x));
    const security = ["Encrypt data in transit (HTTPS) and at rest"];
    if (has(/login|account|password|profile/)) security.push("Secure authentication and session handling");
    if (has(/pay|card|billing/)) security.push("Payment data must stay with a PCI-compliant provider");
    if (has(/personal|privacy|gdpr|health|location/)) security.push("Privacy policy and consent for personal data");
    const missing = [
      !has(/budget|\$|usd|eur/) && "Budget is not stated",
      !has(/launch|deadline|release date|by (q[1-4]|\w+ \d{4})/) && "Target launch date is not stated",
      !has(/ios|android|cross-platform|both platforms/) && "Target platform (iOS, Android, both) is not stated",
      !has(/team|developer|designer/) && "Team size and skills are not stated",
    ].filter((x): x is string => Boolean(x));
    return {
      summary: `${projectName ? `${projectName}: ` : ""}${lines[0] ?? text.slice(0, 160)}`,
      businessObjectives: lines.filter((l) => /\b(goal|objective|increase|reduce|grow|improve|launch)\b/i.test(l)).slice(0, 5),
      userRoles: roles.map(sentenceCase),
      functionalRequirements: (explicit.length ? explicit : lines.slice(0, 6)).map((t) => ({ text: t, kind: "explicit" as const })),
      nonFunctionalRequirements: [
        { text: "The app should respond quickly on mid-range phones", kind: "inferred" },
        { text: "The app should work reliably on poor connections", kind: "inferred" },
      ],
      majorFeatures: lines.slice(0, 8),
      externalIntegrations: integrations,
      securityRequirements: security,
      risks: ["Scope may grow before the first release", ...(integrations.length ? ["Third-party integrations can delay delivery"] : [])],
      assumptions: ["A single first release (MVP) will cover the main user journeys", "The team will use a cross-platform or native stack suited to the stated platform"],
      missingInformation: missing,
      questions: missing.map((m) => `${m.replace(" is not stated", "")}: what should we assume?`),
      dependencies: integrations.map((i) => `${i} account and credentials`),
      implementationApproaches: ["Cross-platform (React Native / Flutter) for speed and a shared codebase", "Native iOS + Android when deep platform features are essential"],
    };
  },

  async generateRoadmap({ brief, projectName, platform }) {
    const phase = (name: string, weeks: number, objective: string, tools: string[]) => ({
      name,
      description: `${name} for ${projectName ?? "the project"}.`,
      objective,
      estimatedDurationWeeks: weeks,
      tasks: [`Plan ${name.toLowerCase()} activities`, `Execute ${name.toLowerCase()} work`, `Review results with stakeholders`],
      dependencies: [] as string[],
      deliverables: [`${name} summary`],
      risks: [`${name} takes longer than planned`],
      recommendedTools: tools,
      acceptanceCriteria: [`${name} outputs reviewed and approved`],
      checkpoints: [`${name} kickoff held`, `${name} outputs approved`],
      completionRequirements: ["All checkpoints completed", "Stakeholder approval documented"],
      keyRecommendation: `Keep ${name.toLowerCase()} small and time-boxed.`,
      beginnerExplanation: `This phase covers ${name.toLowerCase()}: ${objective.toLowerCase()}`,
    });
    const phases = [
      phase("Discovery", 2, "Agree on goals, audience and the first release scope", ["Notion", "Miro"]),
      phase("UX/UI Design", 4, "Design the screens and flows users will touch", ["Figma"]),
      phase("Architecture", 2, "Choose technology and plan how pieces fit together", ["Draw.io", "OpenAPI"]),
      phase("Development", 12, "Build the app and backend in short iterations", ["Git", "CI/CD", "Jira"]),
      phase("Quality Assurance", 3, "Find and fix bugs, security and performance issues", ["Jest", "Detox", "BrowserStack"]),
      phase("User Acceptance Testing", 2, "Business users confirm the app does what was agreed", ["TestFlight", "Google Play Internal Testing"]),
      phase("Staging", 1, "Rehearse the release in a production-like environment", ["AWS / GCP", "Terraform"]),
      phase("Production Launch", 2, "Publish to the App Store and Google Play", ["App Store Connect", "Google Play Console"]),
      phase("Support & Maintenance", 4, "Monitor, fix and improve after launch", ["Sentry", "Firebase Crashlytics"]),
    ];
    const lines = brief.split(/\n|(?<=[.!?])\s+/).map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim()).filter((l) => l.length > 8).slice(0, 10);
    const features = [
      ...lines.map((l) => ({ name: sentenceCase(l.split(/\s+/).slice(0, 5).join(" ").replace(/[.,;:]$/, "")), group: "Mobile Application", description: l, priority: "medium" as const, estimatedDays: 25 })),
      { name: "Authentication", group: "Authentication", description: "Sign up, sign in and session handling.", priority: "high" as const, estimatedDays: 20 },
      { name: "Backend API", group: "Backend Services", description: "Core API and database.", priority: "high" as const, estimatedDays: 35 },
      { name: "CI/CD Pipeline", group: "Infrastructure", description: "Automatic build, test and release.", priority: "medium" as const, estimatedDays: 12 },
      { name: "Automated Test Suite", group: "Testing", description: `Regression tests for ${platform ?? "the app"}.`, priority: "high" as const, estimatedDays: 20 },
      { name: "Store Submission", group: "Deployment", description: "App Store and Google Play release.", priority: "high" as const, estimatedDays: 10 },
    ];
    return { phases, features };
  },

  async generateRecommendations(project, featureId, today) {
    const f = project.features.find((x) => x.id === featureId);
    if (!f) return { recommendations: [{ title: "Feature not found", detail: "Select a feature from the timeline to get recommendations." }] };
    const recs: { title: string; detail: string }[] = [];
    const next = nextCheckpoint(f);
    if (f.status === "not_started") recs.push({ title: "Confirm the start date", detail: `${f.name} has not started${f.schedule.kickoff ? ` (planned ${f.schedule.kickoff})` : ""}. Confirm owners and requirements before kickoff.` });
    else if (next) recs.push({ title: `Next checkpoint: ${next.name}`, detail: `${next.description} Criteria: ${next.acceptanceCriteria.join("; ")}.` });
    const pending = f.dependencies.map((d) => project.features.find((x) => x.id === d)).filter((d): d is Feature => !!d && d.status !== "production");
    if (pending.length) recs.push({ title: "Watch your dependencies", detail: `${f.name} depends on ${pending.map((d) => `${d.name} (${STATUS_META[d.status].label})`).join(", ")}. It cannot reach production until they do.` });
    if (f.risk) recs.push({ title: "Mitigate the known risk", detail: `${f.risk.description} Suggested: ${f.risk.mitigation}` });
    if (isOverdue(f, today)) recs.push({ title: "A milestone date has passed", detail: "Update the dates if the plan changed, or escalate the delay to the product owner." });
    if (!f.schedule.kickoff) recs.push({ title: "Add dates", detail: "Without dates this feature cannot appear in the timeline or in milestone tracking." });
    recs.push({ title: "Ask your developer", detail: `"What could block ${f.name}, and how will we know it is done?"` });
    return { recommendations: recs.slice(0, 6) };
  },

  async answerQuestion(project, question, _history, today) {
    const q = question.toLowerCase();
    const { remaining, atRisk, percent } = notReady(project, today);
    const active = activeFeatures(project);
    const risky = project.features.filter((f) => isAtRisk(f, today));
    const steps = active.slice(0, 3).map((f) => {
      const cp = nextCheckpoint(f);
      return cp ? `${f.name}: complete "${cp.name}"` : `${f.name}: confirm it is ready for the next stage`;
    });

    if (/next|start|begin|priorit/.test(q)) {
      return {
        answer: active.length
          ? `Focus on the work already in progress before starting anything new. The highest-priority active features are ${active.slice(0, 3).map((f) => `${f.name} (${STATUS_META[f.status].label})`).join(", ")}.${atRisk ? ` ${atRisk} feature(s) are at risk, so review those first.` : ""}`
          : "Nothing is in progress yet. Start with the earliest not-started feature on the timeline and confirm its kickoff date.",
        suggestedNextSteps: steps,
      };
    }
    if (/ready|production|launch|release/.test(q)) {
      const ready = remaining === 0 && atRisk === 0;
      return {
        answer: ready
          ? "Every feature is in production and nothing is flagged at risk. Confirm monitoring, support and store requirements are in place."
          : `Not yet. ${percent}% of features are in production, ${remaining} are still to go and ${atRisk} are at risk. The target launch date is ${project.targetLaunchDate}.`,
        suggestedNextSteps: ["Finish QA and UAT on every critical feature", "Resolve all at-risk items", "Review store requirements and the privacy policy"],
      };
    }
    if (/delay|late|slip|behind/.test(q)) {
      return {
        answer: risky.length
          ? `Things that could delay your launch: ${risky.slice(0, 4).map((f) => `${f.name}${f.risk ? ` (${f.risk.description})` : " (a milestone date has passed)"}`).join("; ")}.`
          : "No feature is currently flagged. The most common causes of delay are changes in scope, late feedback during UAT and store review rejections.",
        suggestedNextSteps: ["Freeze scope for the first release", "Book review time with stakeholders in advance"],
      };
    }
    if (/skip|why.*(necessary|need)|important/.test(q)) {
      return {
        answer: "Each checkpoint protects the next stage. Skipping design approval means rework in code; skipping QA ships bugs to customers; skipping UAT means the business has not confirmed the app does what it asked for; skipping staging hides configuration problems until launch day.",
        suggestedNextSteps: ["Keep checkpoints small so they are quick to complete"],
      };
    }
    if (/developer|ask|question/.test(q)) {
      return {
        answer: "Good questions for your developer: What is the riskiest part of this plan? Which features depend on third-party services? How will we know a feature is done? How are releases tested before customers see them? Who fixes issues after launch?",
        suggestedNextSteps: ["Ask for a short written answer to each question"],
      };
    }
    if (/backend|server|api/.test(q)) {
      const backend = project.features.filter((f) => /api|service|database|backend/i.test(f.name));
      return {
        answer: `A backend is needed whenever data must be shared between users or devices, or when logins, payments and orders are involved. This project already plans ${backend.length} backend features (${backend.slice(0, 3).map((f) => f.name).join(", ")}).`,
        suggestedNextSteps: ["Confirm which data must live on a server"],
      };
    }
    if (/risk|technology|stack/.test(q)) {
      return {
        answer: `The stack is ${project.techStack || "not defined yet"}. Main risks: depending on few people who know it, third-party service limits and upgrade effort when mobile operating systems change.${risky.length ? ` Currently flagged: ${risky.slice(0, 3).map((f) => f.name).join(", ")}.` : ""}`,
        suggestedNextSteps: ["Document why the stack was chosen"],
      };
    }
    return {
      answer: `${project.name} has ${project.features.length} features: ${percent}% are in production, ${active.length} are in progress, ${atRisk} are at risk. Ask me what to do next, whether you are ready for production, what could delay the launch, or what to ask your developer.`,
      suggestedNextSteps: steps,
    };
  },

  async auditProject(project, today): Promise<AuditResult> {
    const recs: AuditResult["recommendations"] = [];
    const feats = project.features;

    for (const f of feats.filter((x) => x.risk?.level === "high")) {
      recs.push({ severity: "high", description: `${f.name} carries a high risk: ${f.risk?.description}`, whyItMatters: "High-risk work is the most likely cause of a missed launch date.", suggestedAction: f.risk?.mitigation ?? "Define a mitigation plan.", related: f.name });
    }
    for (const f of feats.filter((x) => isOverdue(x, today))) {
      recs.push({ severity: "high", description: `${f.name} has a milestone date in the past (${STATUS_META[f.status].label}).`, whyItMatters: "Overdue items signal an unrealistic schedule.", suggestedAction: "Re-plan the dates or remove the blocker.", related: f.name });
    }
    for (const f of feats) {
      for (const dep of f.dependencies.map((d) => feats.find((x) => x.id === d)).filter((d): d is Feature => !!d)) {
        if (idx(f) >= 3 && idx(dep) <= 1) {
          recs.push({ severity: "high", description: `${f.name} is in ${STATUS_META[f.status].label} but depends on ${dep.name}, which is only ${STATUS_META[dep.status].label}.`, whyItMatters: "Testing work against an unfinished prerequisite produces unreliable results.", suggestedAction: `Finish ${dep.name} first or re-sequence ${f.name}.`, related: f.name });
        } else if (f.schedule.kickoff && dep.schedule.production && f.schedule.kickoff < dep.schedule.production && dep.status !== "production" && idx(f) === 0) {
          recs.push({ severity: "medium", description: `${f.name} is planned to start before its dependency ${dep.name} reaches production (${dep.schedule.production}).`, whyItMatters: "Starting early is fine only if the interface is frozen.", suggestedAction: "Confirm the interface is agreed or move the start date.", related: f.name });
        }
      }
    }
    const has = (re: RegExp) => feats.some((f) => re.test(`${f.name} ${f.description}`));
    if (!has(/test|qa/i)) recs.push({ severity: "high", description: "No testing activities appear in the roadmap.", whyItMatters: "Bugs found by customers are costly and hurt store ratings.", suggestedAction: "Add automated and manual testing features.", related: "Testing" });
    if (!has(/security|penetration|auth/i)) recs.push({ severity: "high", description: "No security work is planned.", whyItMatters: "Apps handling accounts or payments are common targets.", suggestedAction: "Add a security review and penetration test.", related: "Security" });
    if (!has(/store|submission|release/i)) recs.push({ severity: "medium", description: "App Store / Google Play submission is not in the roadmap.", whyItMatters: "Store reviews take days and can reject the app.", suggestedAction: "Add submission work with buffer time.", related: "Deployment" });
    if (!has(/monitor|logging|crash|support|maintenance/i)) recs.push({ severity: "medium", description: "No monitoring or maintenance plan exists.", whyItMatters: "Without crash reports you learn about problems from angry reviews.", suggestedAction: "Add crash reporting and a maintenance plan.", related: "Support" });

    const lastRelease = feats.map((f) => f.schedule.production).filter((d): d is string => !!d).sort().pop();
    if (lastRelease && lastRelease > project.targetLaunchDate) {
      const days = Math.round((parseDate(lastRelease).getTime() - parseDate(project.targetLaunchDate).getTime()) / 86_400_000);
      recs.push({ severity: "high", description: `The last feature reaches production on ${lastRelease}, ${days} days after the target launch (${project.targetLaunchDate}).`, whyItMatters: "The plan does not support the promised date.", suggestedAction: "Cut scope, add capacity or move the launch date.", related: "Schedule" });
    }
    const noDates = feats.filter((f) => !f.schedule.kickoff && !f.schedule.production);
    if (noDates.length) recs.push({ severity: "low", description: `${noDates.length} feature(s) have no dates.`, whyItMatters: "Undated work cannot be tracked or included in milestones.", suggestedAction: "Add estimated dates.", related: noDates[0].name });

    const order = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    recs.sort((a, b) => order[a.severity] - order[b.severity]);
    return {
      summary: recs.length ? `${recs.length} finding(s) for ${project.name} as of ${toIso(today)}. This audit is advisory; nothing was changed.` : `No issues found for ${project.name}. This audit is advisory.`,
      recommendations: recs,
    };
  },

  async analyzeScopeChange(project, change, today): Promise<ScopeImpactResult> {
    const lower = change.toLowerCase();
    const topic = sentenceCase(change.replace(/^(the )?(client|customer|stakeholder|business)\s+(wants|asked|would like)( to)?( add)?\s*/i, "").replace(/[.!?]+$/, "").split(/\s+/).slice(0, 5).join(" ")) || "Requested change";
    const keys = new Set(words(change));
    const affected = project.features.filter((f) => words(`${f.name} ${f.description}`).some((w) => keys.has(w))).slice(0, 5);
    const groupId = (re: RegExp, fallback: string) => project.groups.find((g) => re.test(`${g.id} ${g.name}`))?.id ?? project.groups[0]?.id ?? fallback;
    const backendDeps = project.features.filter((f) => f.groupId === groupId(/backend/i, "backend") && f.status !== "production").slice(0, 1).map((f) => f.id);
    const realtime = /real-?time|chat|messag|live/.test(lower);
    const payment = /pay|checkout|subscription|billing/.test(lower);
    const auth = /login|auth|sign|account|permission/.test(lower);

    const newFeatures = [
      { name: `${topic} – Backend`, description: `Server-side logic and data for: ${change}`, group: groupId(/backend/i, "backend"), priority: "high" as const, estimatedDays: realtime ? 35 : 25, dependencies: backendDeps },
      { name: `${topic} – Mobile UI`, description: `Screens and interactions for: ${change}`, group: groupId(/mobile/i, "mobile"), priority: "medium" as const, estimatedDays: 20, dependencies: [] as string[] },
      { name: `${topic} – QA & Regression`, description: `Test coverage for the new behaviour and regression of ${affected.map((a) => a.name).join(", ") || "existing features"}.`, group: groupId(/test/i, "testing"), priority: "medium" as const, estimatedDays: 10, dependencies: [] as string[] },
    ];
    const total = newFeatures.reduce((s, f) => s + f.estimatedDays, 0);
    return {
      summary: `"${change}" adds roughly ${newFeatures.length} pieces of work and touches ${affected.length} existing feature(s).`,
      affectedFeatures: affected.map((f) => f.name),
      newFeatures,
      additionalDependencies: [...(payment ? ["Payment provider approval"] : []), ...(realtime ? ["Real-time messaging service (e.g. WebSocket or a managed provider)"] : []), ...(auth ? ["Updated identity and permission model"] : [])],
      architecturalImplications: [realtime ? "Needs a persistent connection layer and message storage; plan for scaling and offline sync." : "Review whether current APIs and data model can carry the new data.", "Update API contracts and document the change."],
      risks: ["Late scope changes put the launch date at risk", ...(realtime ? ["Real-time systems are harder to test and operate"] : []), ...(payment ? ["Payment compliance can add review time"] : [])],
      testingImplications: ["Add test cases for the new behaviour", "Re-run regression on affected features"],
      deploymentImplications: ["Additional configuration in staging and production", "Mention the change in store release notes"],
      scheduleImpactDays: Math.ceil(total / 2),
      scheduleImpactNote: `About ${Math.ceil(total / 2)} extra working days if backend and mobile work run in parallel (${total} effort-days in total), as of ${toIso(today)}.`,
    };
  },
};
