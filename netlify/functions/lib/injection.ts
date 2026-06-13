// Prompt-injection defence — Layers C (hard blocklist) and D (heuristic flags).
// Layer A (structural isolation) lives in gemini.ts; Layer B (sanitise) in sanitise.ts.
//
// Philosophy: a hard match REJECTS the request (generic error to user, logged as
// "injection_attempt"). Heuristics never reject — they only raise a monitoring flag.

export interface InjectionVerdict {
  blocked: boolean;          // hard match -> reject
  suspicious: boolean;       // heuristic flag -> log only, still proceed
}

// --- Layer C: 5-category hard blocklist -------------------------------------
const HARD_PATTERNS: RegExp[] = [
  // 1. Classic instruction injection
  /ignore (the )?(previous|above|all|prior)/i,
  /disregard (all|the |any |previous|above|prior|your)/i,
  /forget (everything|all|your|the |previous|prior|instructions|context)/i,
  /your (new|updated|real|actual|true) (instructions|task|purpose|role|goal|job)/i,
  /you (are|must|should|will|shall) now\b/i,
  /new instructions?\s*:/i,

  // 2. Role / identity hijacking
  /\bact as (a|an|the)?\s*[a-z]/i,
  /pretend (you are|to be|that you|you're)/i,
  /\b(roleplay|jailbreak|do anything now|\bDAN\b)/i,
  /(system|developer|god|admin|root|master)\s*(prompt|mode|instructions?|override|access)/i,
  /stop being\b/i,

  // 3. Delimiter escape attempts
  /---\s*(claim|input)\s*-?\s*(start|end)\s*---/i,
  /<\/?(system|user|assistant|human|ai|instruction)>/i,
  /(\[INST\]|\[\/INST\]|<<SYS>>|<\/SYS>>)/i,

  // 4. Output-format hijacking
  /respond (only|always|instead|now) (with|in|as)/i,
  /\breturn (only|just|always)\s+(json|text|yes|no|true|false)/i,
  /answer (every|all|any) (question|prompt)/i,

  // 5. Task-embedded injection (keyword proximity, not exact phrase)
  /translate (the following|this)[\s\S]{0,40}\bignore\b/i,
  /summari[sz]e (this|the following)[\s\S]{0,40}\binstead\b/i,
];

// --- Layer D: structural anomaly heuristics (flag only) ---------------------
const INSTRUCTION_VERBS = /\b(must|shall|always|never|only|instead|now)\b/gi;
const DELIMITER_LIKE = /(---|===|###|>>>)/g;
const COMMAND_PREFIX = /^\s*(translate|return|output|respond|print|execute|run)\s*:/i;

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function countScripts(text: string): number {
  let n = 0;
  if (/[a-zA-Z]/.test(text)) n++;          // Latin
  if (/[؀-ۿ]/.test(text)) n++;   // Arabic
  if (/[ঀ-৿]/.test(text)) n++;   // Bengali
  if (/[Ѐ-ӿ]/.test(text)) n++;   // Cyrillic
  if (/[一-鿿]/.test(text)) n++;   // CJK
  return n;
}

/**
 * Evaluate sanitised input for injection. Call AFTER sanitiseClaim.
 */
export function checkInjection(clean: string): InjectionVerdict {
  for (const re of HARD_PATTERNS) {
    if (re.test(clean)) {
      return { blocked: true, suspicious: true };
    }
  }

  const suspicious =
    countMatches(clean, INSTRUCTION_VERBS) > 5 ||
    countMatches(clean, DELIMITER_LIKE) > 2 ||
    COMMAND_PREFIX.test(clean) ||
    countScripts(clean) >= 3;

  return { blocked: false, suspicious };
}
