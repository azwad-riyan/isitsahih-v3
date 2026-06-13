// Server-side logging to Google Apps Script (Google Sheets backend).
// Every row carries a `tab` field so Code.gs routes it to the right sheet:
//   requests | errors | api_usage | shares | key_health
//
// Logging runs from the server (not the browser), so it is reliable and never
// exposes anything to the client. Failures here are swallowed — logging must
// never break a user request.

function endpoints(): string[] {
  const urls = [
    process.env.PRIMARY_LOG_URL || process.env.VITE_PRIMARY_LOG_URL,
    process.env.BACKUP_LOG_URL || process.env.VITE_BACKUP_LOG_URL,
    process.env.SHARE_LOG_URL,
  ];
  // de-dupe + keep only real URLs
  return [...new Set(urls.filter((u): u is string => !!u && u.startsWith("http")))];
}

async function post(url: string, body: URLSearchParams, signal: AbortSignal) {
  try {
    await fetch(url, { method: "POST", body, signal });
  } catch {
    /* swallow — logging is best-effort */
  }
}

/**
 * Send one row to every configured log endpoint. Awaited (with a hard timeout)
 * so the row is flushed before the serverless function returns.
 */
export async function logEvent(tab: string, data: Record<string, unknown>): Promise<void> {
  const targets = endpoints();
  if (targets.length === 0) return;

  const body = new URLSearchParams();
  body.append("tab", tab);
  body.append("timestamp", new Date().toISOString());
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    body.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    await Promise.allSettled(targets.map((u) => post(u, body, controller.signal)));
  } finally {
    clearTimeout(timer);
  }
}

// First N chars only — we never log full claims (privacy).
export function preview(text: string, n = 80): string {
  return text.length > n ? text.slice(0, n) : text;
}
