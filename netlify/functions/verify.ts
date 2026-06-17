// POST /.netlify/functions/verify
// The full server-side verification pipeline. Keys live here, never in the browser.
//
// Contract with the frontend:
//   request:  { claim: string, language: "English"|"Bangla", sessionId?: string }
//   response: { ok: true, result: VerificationResult }   on success
//             { ok: false }                               on ANY failure/rejection
// The frontend shows a single generic error whenever ok is false. The real
// cause is only ever written to the logs.
import { getStore } from "@netlify/blobs";
import { sanitiseClaim } from "./lib/sanitise";
import { checkInjection } from "./lib/injection";
import { searchKalimat } from "./lib/kalimat";
import { getVerdict } from "./lib/gemini";
import { logEvent, preview } from "./lib/log";
import { extractClientMeta } from "./lib/clientmeta";
import type { ClientMeta, NetlifyContextLike } from "./lib/clientmeta";
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

function siteUrl(req: Request): string {
  const fromEnv = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://isitsahih.app";
  }
}

interface ShareBlob {
  id: string;
  createdAt: string;
  claim: string;
  result: VerificationResult;
  language: Language;
  appVersion: string;
  sessionId: string;
}

/**
 * Persist EVERY result to Netlify Blobs so a shareable, tamper-proof link always
 * exists — whether or not the user later chooses to share. On success the result
 * is mutated in place with shareId/shareUrl. Failure is swallowed: a missing
 * share link must never break verification (the frontend falls back to
 * save-result on demand).
 */
async function persistShare(
  result: VerificationResult,
  claim: string,
  language: Language,
  sessionId: string,
  req: Request,
): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const blob: ShareBlob = {
      id,
      createdAt: new Date().toISOString(),
      claim,
      result,
      language,
      appVersion: APP_VERSION,
      sessionId,
    };
    const store = getStore("shares");
    await store.setJSON(id, blob);
    result.shareId = id;
    result.shareUrl = `${siteUrl(req)}/share/${id}`;
  } catch {
    /* link is best-effort; verification still succeeds without it */
  }
}

export default async function handler(
  req: Request,
  context?: NetlifyContextLike,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return fail();

  const started = Date.now();
  let language: Language = "English";
  let sessionId = "";
  let claimForLog = "";
  // Geo (country/city/timezone) + device/OS/browser + language preference.
  // Best-effort; empty under `netlify dev` where edge geo isn't populated.
  const meta = extractClientMeta(req, context);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    language = body.language === "Bangla" ? "Bangla" : "English";
    sessionId = typeof body.sessionId === "string" ? body.sessionId : "";

    // --- Gate 1: sanitise + length -----------------------------------------
    const { clean, lengthError } = sanitiseClaim(body.claim);
    claimForLog = clean;
    if (lengthError) {
      await logReject(lengthError, clean, language, sessionId, started, meta);
      return fail();
    }

    // --- Gate 2: prompt-injection defence ----------------------------------
    const injection = checkInjection(clean);
    if (injection.blocked) {
      await logReject("injection_attempt", clean, language, sessionId, started, meta);
      return fail();
    }

    // --- Search (no AI) -----------------------------------------------------
    const search = await searchKalimat(clean, language, 10);
    const topRefs = search.references.slice(0, MAX_REFERENCES);

    // --- No authentic source found -----------------------------------------
    if (topRefs.length === 0) {
      const result = buildNoSourceResult(language);
      await persistShare(result, clean, language, sessionId, req);
      await logSuccess(result, clean, language, sessionId, started, meta, {
        kalimat: search.diagnostics,
        gemini: null,
        injectionSuspicious: injection.suspicious,
      });
      return jsonResponse({ ok: true, result });
    }

    // --- Verdict (AI, constrained) -----------------------------------------
    const gemini = await getVerdict(clean, topRefs, language);
    if (!gemini.result) {
      await logError("upstream_error", clean, language, sessionId, started, meta, {
        stage: "gemini",
        exhaustedAll: gemini.exhaustedAll,
        attempts: gemini.attempts,
      });
      await logApiUsage(sessionId, search.diagnostics, gemini.attempts);
      return fail();
    }

    const result = assembleResult(language, topRefs, gemini.result);
    await persistShare(result, clean, language, sessionId, req);
    await logSuccess(result, clean, language, sessionId, started, meta, {
      kalimat: search.diagnostics,
      gemini: { keyIndexUsed: gemini.keyIndexUsed, attempts: gemini.attempts },
      injectionSuspicious: injection.suspicious,
    });
    return jsonResponse({ ok: true, result });
  } catch (err: any) {
    await logError("unknown", claimForLog, language, sessionId, started, meta, {
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
  // Attach AI connection notes to references by index. The AI never edits a
  // reference's Arabic/translation — it only annotates which ones are relevant.
  const connectionByIndex = new Map<number, string>();

  // Safety net: replace any "reference [N]" or "[N]" patterns the AI emitted
  // with the actual source name so users see e.g. "Sunan Ibn Majah 1942" instead.
  const sanitiseConnection = (text: string): string => {
    return text.replace(/\breference\s*\[(\d+)\]/gi, (_, n) => {
      const idx = parseInt(n, 10);
      return refs[idx]?.source ?? `reference [${n}]`;
    }).replace(/\[([0-9]+)\]/g, (match, n) => {
      const idx = parseInt(n, 10);
      // Only replace if it looks like a citation (i.e. the index exists in refs)
      return idx >= 0 && idx < refs.length ? (refs[idx]?.source ?? match) : match;
    });
  };

  for (const r of ai.relevant) {
    if (r.index >= 0 && r.index < refs.length && r.connection.trim()) {
      connectionByIndex.set(r.index, sanitiseConnection(r.connection.trim()));
    }
  }

  // Drop references the AI did NOT flag as relevant. Kalimat's semantic search is
  // broad and returns loosely-related hits; the AI only writes a connection note
  // for references that genuinely bear on the claim. A reference with no
  // connection note is noise, so we never show it.
  const references = refs
    .map((r, i) => ({ ...r, connection_explanation: connectionByIndex.get(i) }))
    .filter((r) => !!r.connection_explanation);
  const usedReferenceIndices = references.map((_, i) => i);

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

function baseRow(
  claim: string,
  language: Language,
  sessionId: string,
  started: number,
  meta: ClientMeta,
) {
  return {
    session_id: sessionId,
    language,
    claim_length: claim.length,
    claim_preview: preview(claim),
    latency_ms: Date.now() - started,
    app_version: APP_VERSION,
    // client context (geo + device + language preference)
    country: meta.country,
    country_code: meta.country_code,
    city: meta.city,
    region: meta.region,
    timezone: meta.timezone,
    device_type: meta.device_type,
    os: meta.os,
    browser: meta.browser,
    accept_language: meta.accept_language,
    user_agent: meta.user_agent,
  };
}

async function logSuccess(
  result: VerificationResult,
  claim: string,
  language: Language,
  sessionId: string,
  started: number,
  meta: ClientMeta,
  extra: { kalimat: any; gemini: any; injectionSuspicious: boolean },
) {
  await logEvent("requests", {
    ...baseRow(claim, language, sessionId, started, meta),
    claim, // full claim text
    verdict: result.verdictCanonical,
    explanation: result.explanation, // full generated explanation
    references: result.references, // full generated references (JSON)
    reference_count: result.references.length,
    verdict_overridden: result.verdictOverridden,
    no_sources_found: result.noSourcesFound,
    injection_suspicious: extra.injectionSuspicious,
    gemini_key_index: extra.gemini?.keyIndexUsed ?? "",
    share_id: result.shareId ?? "",
    share_url: result.shareUrl ?? "",
  });
  await logApiUsage(sessionId, extra.kalimat, extra.gemini?.attempts ?? []);
}

async function logReject(
  reason: RejectionReason,
  claim: string,
  language: Language,
  sessionId: string,
  started: number,
  meta: ClientMeta,
) {
  await logEvent("requests", {
    ...baseRow(claim, language, sessionId, started, meta),
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
  meta: ClientMeta,
  detail: Record<string, unknown>,
) {
  await logEvent("errors", {
    ...baseRow(claim, language, sessionId, started, meta),
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
