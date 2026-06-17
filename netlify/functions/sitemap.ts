// GET /.netlify/functions/sitemap?part=pages|shares
//
// Serves a two-part sitemap index strategy:
//   ?part=pages  — static application routes (homepage, etc.)
//   ?part=shares — dynamic /share/{uuid} pages enumerated from Netlify Blobs
//
// public/sitemap.xml is a sitemapindex that references both URLs above.
// Google Search Console should be pointed at:
//   https://isitsahih.app/sitemap.xml
//
// Caching:
//   pages  part: cached 24 h (rarely changes)
//   shares part: cached 1 h (new shares created continuously)
//
// Share page SEO value:
//   Each /share/{uuid} page contains a unique Islamic claim + AI-generated
//   verdict + authentic hadith/Quran references. Content is genuinely unique
//   per URL, so these pages are safe to index at scale.

import { getStore } from "@netlify/blobs";

export const config = { path: "/.netlify/functions/sitemap" };

const PROD_ORIGIN = "https://isitsahih.app";
const SHARES_BATCH_LIMIT = 49_000; // stay well under Google's 50 k per-file cap

function siteOrigin(req: Request): string {
  // On Netlify, process.env.URL is the primary domain; DEPLOY_PRIME_URL is
  // the branch deploy URL. Fall back to request origin in local dev.
  const fromEnv = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  try {
    return new URL(req.url).origin;
  } catch {
    return PROD_ORIGIN;
  }
}

function xmlResponse(body: string, cacheSeconds: number): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}, stale-while-revalidate=60`,
    },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, { status });
}

// ---------------------------------------------------------------------------
// Part: pages — static routes
// ---------------------------------------------------------------------------
function buildPagesSitemap(origin: string): string {
  // Add any new indexable static routes here.
  // DO NOT list /share/* here — that is handled by the shares part.
  const staticPages: Array<{ path: string; lastmod: string }> = [
    { path: "/", lastmod: "2026-06-17" },
    { path: "/about.html", lastmod: "2026-06-17" },
    { path: "/privacy.html", lastmod: "2026-06-17" },
  ];

  const urls = staticPages
    .map(
      ({ path, lastmod }) => `
  <url>
    <loc>${origin}${path}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ---------------------------------------------------------------------------
// Part: shares — enumerate all blobs from the "shares" store
// ---------------------------------------------------------------------------
async function buildSharesSitemap(origin: string): Promise<string> {
  const store = getStore("shares");

  // Netlify Blobs list() paginates automatically via the cursor. We collect
  // all keys up to SHARES_BATCH_LIMIT to stay within the 50 k sitemap cap.
  // If the store ever exceeds ~49 k entries this function will only emit the
  // first batch; the missing tail is acceptable (those pages remain crawlable
  // via internal links) and avoids a Google-penalised oversized sitemap.
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await store.list({ cursor, paginate: true });
    for (const blob of page.blobs) {
      if (keys.length >= SHARES_BATCH_LIMIT) break;
      keys.push(blob.key);
    }
    cursor = page.cursor;
    if (keys.length >= SHARES_BATCH_LIMIT) break;
  } while (cursor);

  // Blobs do not expose a creation date through list(). We omit lastmod
  // rather than emit a fabricated date, which is worse for crawl budget.
  const urls = keys
    .map(
      (key) => `
  <url>
    <loc>${origin}/share/${key}</loc>
  </url>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return errorResponse(405, "Method Not Allowed");

  const { searchParams } = new URL(req.url);
  const part = searchParams.get("part");
  const origin = siteOrigin(req);

  if (part === "pages") {
    const xml = buildPagesSitemap(origin);
    return xmlResponse(xml, 86_400); // 24 h
  }

  if (part === "shares") {
    try {
      const xml = await buildSharesSitemap(origin);
      return xmlResponse(xml, 3_600); // 1 h
    } catch (err) {
      // Surface the error in Netlify function logs but return a valid (empty)
      // sitemap so crawlers do not receive a 500 and do not de-index the URL.
      console.error("[sitemap] failed to enumerate shares store:", err);
      const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
      return xmlResponse(fallback, 60); // retry in 1 min
    }
  }

  return errorResponse(400, 'Missing required query param: part=pages|shares');
}
