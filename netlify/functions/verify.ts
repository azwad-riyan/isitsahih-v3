// POST /.netlify/functions/verify
// The full server-side verification pipeline. Keys live here, never in the browser.
//
// Contract with the frontend:
//   request:  { claim: string, language: "English"|"Bangla", sessionId?: string }
//   response: { ok: true, result: VerificationResult }   on success
//             { ok: false }                               on ANY failure/rejection
// The frontend shows a single generic error whenever ok is false. The real
// cause is only ever written to the logs.
import { sanitiseClaim } from "./lib/sanitise";
import { checkInjection } from "./lib/injection";
import { searchKalimat } from "./lib/kalimat";
import { getVerdict } from "./lib/gemini";
import { logEvent, preview } from "./lib/log";
import type {
  Language,
  Reference,
  VerificationResult,
  Verdict,
  RejectionReason,
} from "./lib/types";

export const config = { path: "/.netlify/functions/verify" };

const APP_VERSION = "4.0.0";
const MAX_REFERENCES = 6; // top-N by Kalimat relevance shown + sent to the AI

const VERDICT_LABEL: Record<Language, Record<Verdict, string>> = {
  English: { True: "True", False: "False", Uncertain: "Uncertain" },
  Bangla: { True: "সত্য", False: "মিথ্যা", Uncertain: "অনিশ্চিত" },
};

const NO_SOURCE_EXPLANATION: Record<Language, string> = {
  English:
    "We could not find a Quranic verse or an authentic hadith that directly addresses this. This does not by itself mean the claim is false — only that no direct authentic source was found. Please consult a qualified scholar for a ruling.",
  Bangla:
    "এই বিষয়ে সরাসরি কোনো কুরআনের আয়াত বা সহীহ হাদিস খুঁজে পাওয়া যায়নি। এর অর্থ এই নয় যে দাবিটি মিথ্যা — শুধু সরাসরি কোনো নির্ভরযোগ্য উৎস পাওয়া যায়নি। সঠিক সিদ্ধান্তের জন্য একজন যোগ্য আলেমের পরামর্শ নিন।",
};

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(): Response {
  // The ONE generic failure shape. Never leak the reason to the client.
  return jsonResponse({ ok: false }, 200);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return fail();

  const started = Date.now();
  let language: Language = "English";
  let sessionId = "";
  let claimForLog = "";

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    language = body.language === "Bangla" ? "Bangla" : "English";
    sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

    // --- Gate 1: sanitise + length -----------------------------------------
    const { clean, lengthError } = sanitiseClaim(body.claim);
    claimForLog = clean;
    if (lengthError) {
      await logReject(lengthError, clean, language, sessionId, started);
      return fail();
    }

    // --- Gate 2: prompt-injection defence ----------------------------------
    const injection = checkInjection(clean);
    if (injection.blocked) {
      await logReject("injection_attempt", clean, language, sessionId, started);
      return fail();
    }

    // --- Search (no AI) -----------------------------------------------------
    const search = await searchKalimat(clean, language, 10);
    const topRefs = search.references.slice(0, MAX_REFERENCES);

    // --- No authentic source found -----------------------------------------
    if (topRefs.length === 0) {
      const result = buildNoSourceResult(language);
      await logSuccess(result, clean, language, sessionId, started, {
        kalimat: search.diagnostics,
        gemini: null,
        injectionSuspicious: injection.suspicious,
      });
      return jsonResponse({ ok: true, result });
    }

    // --- Verdict (AI, constrained) -----------------------------------------
    const gemini = await getVerdict(clean, topRefs, language);
    if (!gemini.result) {
      await logError("upstream_error", clean, language, sessionId, started, {
        stage: "gemini",
        exhaustedAll: gemini.exhaustedAll,
        attempts: gemini.attempts,
      });
      await logApiUsage(sessionId, search.diagnostics, gemini.attempts);
      return fail();
    }

    const result = assembleResult(language, topRefs, gemini.result);
    await logSuccess(result, clean, language, sessionId, started, {
      kalimat: search.diagnostics,
      gemini: { keyIndexUsed: gemini.keyIndexUsed, attempts: gemini.attempts },
      injectionSuspicious: injection.suspicious,
    });
    return jsonResponse({ ok: true, result });
  } catch (err: any) {
    await logError("unknown", claimForLog, language, sessionId, started, {
      message: err?.message || String(err),
    });
    return fail();
  }
}

// --- result builders --------------------------------------------------------

function buildNoSourceResult(language: Language): VerificationResult {
  return {
    verdict: VERDICT_LABEL[language].Uncertain,
    verdictCanonical: "Uncertain",
    explanation: NO_SOURCE_EXPLANATION[language],
    references: [],
    usedReferenceIndices: [],
    verdictOverridden: false,
    noSourcesFound: true,
    attributions: [],
  };
}

function assembleResult(
  language: Language,
  refs: Reference[],
  ai: { verdict: Verdict; explanation: string; relevant: Array<{ index: number; connection: string }> },
): VerificationResult {
  // Attach AI connection notes to references by index. The AI never removes a
  // reference and never edits its Arabic/translation — it only annotates.
  const connectionByIndex = new Map<number, string>();
  for (const r of ai.relevant) {
    if (r.index >= 0 && r.index < refs.length && r.connection.trim()) {
      connectionByIndex.set(r.index, r.connection.trim());
    }
  }
  const references = refs.map((r, i) => ({
    ...r,
    connection_explanation: connectionByIndex.get(i),
  }));
  const usedReferenceIndices = [...connectionByIndex.keys()].sort((a, b) => a - b);

  // Integrity guard: a True/False verdict must rest on at least one reference.
  let verdictCanonical = ai.verdict;
  let verdictOverridden = false;
  if ((verdictCanonical === "True" || verdictCanonical === "False") && references.length === 0) {
    verdictCanonical = "Uncertain";
    verdictOverridden = true;
  }

  const attributions = [...new Set(references.map((r) => r.provider).filter(Boolean))] as string[];

  return {
    verdict: VERDICT_LABEL[language][verdictCanonical],
    verdictCanonical,
    explanation: ai.explanation,
    references,
    usedReferenceIndices,
    verdictOverridden,
    noSourcesFound: false,
    attributions,
  };
}

// --- logging wrappers -------------------------------------------------------

function baseRow(claim: string, language: Language, sessionId: string, started: number) {
  return {
    session_id: sessionId,
    language,
    claim_length: claim.length,
    claim_preview: preview(claim),
    latency_ms: Date.now() - started,
    app_version: APP_VERSION,
  };
}

async function logSuccess(
  result: VerificationResult,
  claim: string,
  language: Language,
  sessionId: string,
  started: number,
  extra: { kalimat: any; gemini: any; injectionSuspicious: boolean },
) {
  await logEvent("requests", {
    ...baseRow(claim, language, sessionId, started),
    claim, // full claim text
    verdict: result.verdictCanonical,
    explanation: result.explanation, // full generated explanation
    references: result.references, // full generated references (JSON)
    reference_count: result.references.length,
    verdict_overridden: result.verdictOverridden,
    no_sources_found: result.noSourcesFound,
    injection_suspicious: extra.injectionSuspicious,
    gemini_key_index: extra.gemini?.keyIndexUsed ?? "",
  });
  await logApiUsage(sessionId, extra.kalimat, extra.gemini?.attempts ?? []);
}

async function logReject(
  reason: RejectionReason,
  claim: string,
  language: Language,
  sessionId: string,
  started: number,
) {
  await logEvent("requests", {
    ...baseRow(claim, language, sessionId, started),
    verdict: "REJECTED",
    rejection_reason: reason,
  });
}

async function logError(
  reason: RejectionReason,
  claim: string,
  language: Language,
  sessionId: string,
  started: number,
  detail: Record<string, unknown>,
) {
  await logEvent("errors", {
    ...baseRow(claim, language, sessionId, started),
    rejection_reason: reason,
    ...detail,
  });
}

async function logApiUsage(
  sessionId: string,
  kalimatDiag: Array<{ contentType: string; status: number; count: number; ms: number }>,
  geminiAttempts: Array<{ keyIndex: number; status: number; quota: boolean; ms: number }>,
) {
  for (const d of kalimatDiag || []) {
    await logEvent("api_usage", {
      session_id: sessionId,
      upstream: "kalimat",
      detail: d.contentType,
      status: d.status,
      result_count: d.count,
      ms: d.ms,
      success: d.status === 200,
    });
  }
  for (const a of geminiAttempts || []) {
    await logEvent("api_usage", {
      session_id: sessionId,
      upstream: "gemini",
      key_index: a.keyIndex,
      status: a.status,
      quota: a.quota,
      ms: a.ms,
      success: a.status === 200,
    });
  }
}
