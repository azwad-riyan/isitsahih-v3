// Layer B (pre-sanitisation) + Gate 1 (length) from the validation spec.
// We intentionally do NOT do topic/intent classification — only length + cleanup.

export const MIN_CLAIM_LENGTH = 10;
export const MAX_CLAIM_LENGTH = 500;

// Built at module load so no literal null byte appears in source.
const NULL_BYTE = new RegExp(String.fromCharCode(0), "g");

export interface SanitiseResult {
  clean: string;
  // Set when the length gate fails. Caller turns this into the generic error.
  lengthError?: "too_short" | "too_long";
}

/**
 * Normalise user input before it ever touches a prompt or an API.
 * Order: trim -> collapse whitespace -> strip null bytes -> NFKC normalise.
 * Arabic / Bengali / any non-Latin script is preserved — we only normalise, never transliterate.
 * Length is then gated: <10 -> too_short, >500 -> too_long (rejected, not truncated).
 */
export function sanitiseClaim(raw: unknown): SanitiseResult {
  let text = typeof raw === "string" ? raw : "";

  text = text.trim();
  text = text.replace(/\s+/g, " "); // collapse runs of whitespace/newlines
  text = text.replace(NULL_BYTE, ""); // strip null bytes

  // NFKC folds look-alike / compatibility characters to canonical forms,
  // which defeats unicode-based injection bypasses without harming real scripts.
  try {
    text = text.normalize("NFKC");
  } catch {
    /* normalize is always available on modern Node, but never let it throw */
  }

  if (text.length < MIN_CLAIM_LENGTH) {
    return { clean: text, lengthError: "too_short" };
  }
  if (text.length > MAX_CLAIM_LENGTH) {
    return { clean: text, lengthError: "too_long" };
  }

  return { clean: text };
}
