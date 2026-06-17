// POST /.netlify/functions/track
// Lightweight client-event logger for PWA install / launch analytics.
// The browser cannot write to the log backend directly, so it posts a small
// event here and the server forwards it to the `client_events` sheet (with the
// same geo/device context as every other row). Failures are swallowed — tracking
// must never affect the user.
//
//   request:  { event: string, sessionId?: string, displayMode?: string }
//   response: { ok: boolean }
import { logEvent } from "./lib/log";
import { extractClientMeta } from "./lib/clientmeta";
import type { NetlifyContextLike } from "./lib/clientmeta";

export const config = { path: "/.netlify/functions/track" };

// Only known events are accepted, so the endpoint can't be used as an open log sink.
const ALLOWED_EVENTS = new Set([
  "install_prompt_available", // beforeinstallprompt fired (install is possible)
  "install_prompt_shown",     // we showed our custom install button/prompt
  "install_accepted",         // user accepted the native install prompt
  "install_dismissed",        // user dismissed the native install prompt
  "app_installed",            // appinstalled event — the definitive "installed" signal
  "launch_standalone",        // app opened from the installed icon (standalone display)
  "launch_browser",           // app opened in a normal browser tab
  "share_action",             // user clicked a platform share button (carries platform + shareId)
]);

const SHARE_PLATFORMS = new Set([
  "whatsapp", "facebook", "telegram", "x", "copy", "native",
]);

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export default async function handler(
  req: Request,
  context?: NetlifyContextLike,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ ok: false }, 405);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const event = typeof body.event === "string" ? body.event : "";
    if (!ALLOWED_EVENTS.has(event)) return json({ ok: false }, 400);

    const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 80) : "";
    const displayMode = typeof body.displayMode === "string" ? body.displayMode.slice(0, 30) : "";
    const meta = extractClientMeta(req, context);

    if (event === "share_action") {
      // Platform-specific share click: log to share_actions tab with geo/device context.
      const platform = typeof body.platform === "string" && SHARE_PLATFORMS.has(body.platform)
        ? body.platform
        : "unknown";
      const shareId = typeof body.shareId === "string" ? body.shareId.slice(0, 80) : "";

      await logEvent("share_actions", {
        session_id: sessionId,
        platform,
        share_id: shareId,
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
      });
      return json({ ok: true });
    }

    await logEvent("client_events", {
      event,
      session_id: sessionId,
      display_mode: displayMode,
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
    });

    return json({ ok: true });
  } catch {
    return json({ ok: false }, 500);
  }
}
