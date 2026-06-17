// GET /.netlify/functions/get-result?id=<uuid>
// Returns a stored share blob. The blob is immutable — there is no update path —
// so it can be cached forever.
// Also fires a non-blocking `share_views` log row so we know when shared links
// are actually being opened and by whom.
import { getStore } from "@netlify/blobs";
import { logEvent } from "./lib/log";
import { extractClientMeta } from "./lib/clientmeta";
import type { NetlifyContextLike } from "./lib/clientmeta";

export const config = { path: "/.netlify/functions/get-result" };

function json(obj: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });
}

export default async function handler(req: Request, context?: NetlifyContextLike): Promise<Response> {
  if (req.method !== "GET") return json({ ok: false }, 405, "no-store");

  const id = new URL(req.url).searchParams.get("id");
  // UUID v4 sanity check — reject anything that isn't a plausible id.
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false }, 400, "no-store");
  }

  try {
    const store = getStore("shares");
    const blob = await store.get(id, { type: "json" });
    if (!blob) return json({ ok: false }, 404, "no-store");

    // Non-blocking view log — fires but does not delay the response.
    // Gives per-share traffic data: country, device, browser of viewers.
    const meta = extractClientMeta(req, context);
    logEvent("share_views", {
      share_id: id,
      referrer: req.headers.get("referer") ?? "",
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
    }).catch(() => { /* swallow — logging must never affect the response */ });

    return json(
      { ok: true, share: blob },
      200,
      "public, max-age=31536000, immutable",
    );
  } catch {
    return json({ ok: false }, 500, "no-store");
  }
}
