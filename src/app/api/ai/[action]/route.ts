import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  advisorRequestSchema,
  analyzeRequestSchema,
  auditRequestSchema,
  recommendationsRequestSchema,
  roadmapRequestSchema,
  scopeChangeRequestSchema,
} from "@/ai/schemas";
import { configuredProvider, runAi } from "@/ai/service";

export const dynamic = "force-dynamic";
/** Seconds. Gemini calls can take 30s or more, which exceeds the default on some Vercel plans. */
export const maxDuration = 60;

const MAX_BODY_BYTES = 1_000_000;

async function handle(action: string, body: unknown) {
  const today = new Date();
  switch (action) {
    case "analyze": {
      const input = analyzeRequestSchema.parse(body);
      return runAi((p) => p.analyzeRequirements(input));
    }
    case "roadmap": {
      const input = roadmapRequestSchema.parse(body);
      return runAi((p) => p.generateRoadmap(input));
    }
    case "recommendations": {
      const input = recommendationsRequestSchema.parse(body);
      return runAi((p) => p.generateRecommendations(input.project, input.featureId, today));
    }
    case "advisor": {
      const input = advisorRequestSchema.parse(body);
      return runAi((p) => p.answerQuestion(input.project, input.question, input.history, today));
    }
    case "audit": {
      const input = auditRequestSchema.parse(body);
      return runAi((p) => p.auditProject(input.project, today));
    }
    case "scope-change": {
      const input = scopeChangeRequestSchema.parse(body);
      return runAi((p) => p.analyzeScopeChange(input.project, input.change, today));
    }
    default:
      return null;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "The request is too large." }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "The request body is not valid JSON." }, { status: 400 });
  }

  try {
    const result = await handle(action, body);
    if (!result) return NextResponse.json({ ok: false, error: `Unknown AI action: ${action}` }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ ok: false, error: error.issues.map((i) => i.message).join(" ") }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Something went wrong while processing the AI request." }, { status: 500 });
  }
}

/** Lets the UI show whether real AI is configured, without exposing the key. */
export async function GET() {
  return NextResponse.json({ ok: true, provider: configuredProvider() ? "gemini" : "mock" });
}
