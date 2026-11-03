import { AiError } from "./errors";
import { createGeminiProvider } from "./geminiProvider";
import { mockProvider } from "./mockProvider";
import type { AiProvider } from "./provider";
import type { AiEnvelope } from "./schemas";

type Env = Record<string, string | undefined>;

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Real provider when GEMINI_API_KEY is set, otherwise null (mock mode). */
export function configuredProvider(env: Env = process.env): AiProvider | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const timeoutMs = Number(env.AI_TIMEOUT_MS) || 45_000;
  return createGeminiProvider({ apiKey, model: env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, timeoutMs });
}

/**
 * Runs an AI call. Falls back to the mock provider when Gemini is not configured or fails,
 * and says so in the envelope, so the UI never presents mock output as real AI.
 */
export async function runAi<T>(call: (provider: AiProvider) => Promise<T>, provider: AiProvider | null = configuredProvider()): Promise<AiEnvelope<T>> {
  if (!provider) return { data: await call(mockProvider), source: "mock" };
  try {
    return { data: await call(provider), source: provider.name };
  } catch (error) {
    const message = error instanceof AiError ? error.message : "The AI request failed unexpectedly.";
    return { data: await call(mockProvider), source: "mock", warning: `${message} Showing offline (mock) results instead.` };
  }
}
