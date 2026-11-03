export type AiErrorCode = "not_configured" | "auth" | "rate_limit" | "timeout" | "empty" | "invalid_json" | "invalid_shape" | "api";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}
