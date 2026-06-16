// Best-effort client metadata for analytics + future personalization
// (auto-language by country/browser, device-aware UI, timezone, etc.).
//
// Geo comes from Netlify's edge geolocation (context.geo) — no IP lookup needed.
// Device/OS/browser are parsed from the User-Agent header. The browser's own
// language preference (Accept-Language) is the strongest signal for picking a
// default language later.
//
// PRIVACY: we deliberately do NOT log the raw IP address or precise
// latitude/longitude by default — country/city/timezone are enough to localize
// without storing the most sensitive PII. They're easy to add if ever needed.

// Loosely typed so we don't couple to a specific @netlify/functions version.
interface NetlifyGeo {
  city?: string;
  country?: { code?: string; name?: string };
  subdivision?: { code?: string; name?: string };
  timezone?: string;
}
export interface NetlifyContextLike {
  geo?: NetlifyGeo;
}

export interface ClientMeta {
  country: string;
  country_code: string;
  city: string;
  region: string;
  timezone: string;
  device_type: string; // mobile | tablet | desktop
  os: string;
  browser: string;
  accept_language: string;
  user_agent: string;
}

function parseUA(ua: string): { device_type: string; os: string; browser: string } {
  const u = ua.toLowerCase();

  let device_type = "desktop";
  if (/ipad|tablet|playbook|silk/.test(u) || (/android/.test(u) && !/mobile/.test(u))) {
    device_type = "tablet";
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone|iemobile|blackberry/.test(u)) {
    device_type = "mobile";
  }

  let os = "Unknown";
  if (/windows nt/.test(u)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(u)) os = "iOS";
  else if (/mac os x|macintosh/.test(u)) os = "macOS";
  else if (/android/.test(u)) os = "Android";
  else if (/cros/.test(u)) os = "ChromeOS";
  else if (/linux/.test(u)) os = "Linux";

  let browser = "Unknown";
  if (/edg\//.test(u)) browser = "Edge";
  else if (/opr\/|opera/.test(u)) browser = "Opera";
  else if (/samsungbrowser/.test(u)) browser = "Samsung Internet";
  else if (/chrome\//.test(u)) browser = "Chrome";
  else if (/firefox\//.test(u)) browser = "Firefox";
  else if (/safari\//.test(u) && !/chrome/.test(u)) browser = "Safari";

  return { device_type, os, browser };
}

export function extractClientMeta(req: Request, context?: NetlifyContextLike): ClientMeta {
  const geo = context?.geo || {};
  const ua = req.headers.get("user-agent") || "";
  return {
    country: geo.country?.name || "",
    country_code: geo.country?.code || "",
    city: geo.city || "",
    region: geo.subdivision?.name || geo.subdivision?.code || "",
    timezone: geo.timezone || "",
    accept_language: req.headers.get("accept-language") || "",
    user_agent: ua,
    ...parseUA(ua),
  };
}
