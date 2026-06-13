// POST /.netlify/functions/save-result
// Persists a verification result to Netlify Blobs and returns a permanent,
// tamper-proof share URL. Only this server function can write a blob — there is
// no public write path — so a shared result can never be forged or edited.
import { getStore } from "@netlify/blobs";
import { logEvent, preview } from "./lib/log";
import type { VerificationResult, Language } from "./lib/types";

export const config = { path: "/.netlify/functions/save-result" };

const APP_VERSION = "4.0.0";

interface ShareBlob {
  id: string;
  createdAt: string;
  claim: string;
  result: VerificationResult;
  language: Language;
  appVersion: string;
  sessionId: string;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(status = 400): Response {
  return json({ ok: false }, status);
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return fail(405);

  try {
    const body = (await req.json().catch(() => null)) as any;
    const result = body?.result as VerificationResult | undefined;
    const claim = typeof body?.claim === "string" ? body.claim : "";

    // Minimal validation — required fields only, no transformation.
    if (!result || typeof result.verdict !== "string" || !Array.isArray(result.references)) {
      return fail(400);
    }
    if (claim.length === 0 || claim.length > 600) return fail(400);

    const language: Language = body?.language === "Bangla" ? "Bangla" : "English";
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 80) : "";

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

    const shareUrl = `${siteUrl(req)}/share/${id}`;

    // Non-blocking-ish share log (awaited with internal timeout).
    await logEvent("shares", {
      share_id: id,
      share_url: shareUrl,
      session_id: sessionId,
      verdict: result.verdictCanonical || result.verdict,
      claim_length: claim.length,
      claim_preview: preview(claim),
      language,
      reference_count: result.references.length,
      app_version: APP_VERSION,
      verdict_overridden: !!result.verdictOverridden,
    });

    return json({ ok: true, id, shareUrl });
  } catch {
    return fail(500);
  }
}
