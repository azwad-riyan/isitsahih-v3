/**
 * netlify/edge-functions/og-inject.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on /share/:id. Loads the stored result blob and injects per-share
 * Open Graph / Twitter meta tags into the SPA's HTML so WhatsApp, Telegram, and
 * X show a real preview card (verdict + claim) instead of the generic site card.
 *
 * IsItSahih is a client-rendered SPA, so without this the crawler would only
 * ever see the static index.html meta tags.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default async (request, context) => {
  const url = new URL(request.url);
  const response = await context.next();

  // /share/<id> -> grab the id segment
  const match = url.pathname.match(/^\/share\/([^/?#]+)/);
  const id = match && match[1];
  if (!id) return response;

  let share;
  try {
    const res = await fetch(`${url.origin}/.netlify/functions/get-result?id=${encodeURIComponent(id)}`);
    if (!res.ok) return response;
    const data = await res.json();
    share = data && data.share;
  } catch {
    return response;
  }
  if (!share || !share.result) return response;

  const result = share.result;
  const verdict = result.verdictCanonical || "Uncertain";
  const verdictLabel = result.verdict || verdict;
  const claim = String(share.claim || "").slice(0, 120);
  const explanation = String(result.explanation || "").slice(0, 200);
  const emoji = { True: "✅", False: "❌", Uncertain: "❓" }[verdict] || "🔍";
  const canonicalUrl = `${url.origin}/share/${id}`;

  const title = `${emoji} IsItSahih — ${escapeHtml(verdictLabel)}: "${escapeHtml(claim)}"`;
  const desc = escapeHtml(explanation) + (explanation.length >= 200 ? "…" : "");

  const meta = `
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${url.origin}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${desc}" />
    <meta name="twitter:image" content="${url.origin}/og-image.png" />
    <link rel="canonical" href="${canonicalUrl}" />
  `;

  const html = await response.text();
  const injected = html.replace("</head>", meta + "\n  </head>");

  return new Response(injected, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const config = {
  path: "/share/*",
};
