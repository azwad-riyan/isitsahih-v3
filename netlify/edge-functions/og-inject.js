/**
 * netlify/edge-functions/og-inject.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on /share/:id. Loads the stored result blob and injects per-share
 * Open Graph / Twitter meta tags so WhatsApp, Telegram, and X show a preview.
 *
 * STRATEGY: the preview TEASES, it never spoils. We deliberately do NOT reveal
 * the verdict in the title, description, or image — the goal is curiosity so the
 * recipient clicks through to the site to see the answer.
 *   - Title: the user's question verbatim, or (for a statement) a curiosity hook.
 *   - Description: a generic teaser that withholds the verdict.
 *   - Image: one neutral brand card (og-default.png), same for every share.
 *
 * Reads ONLY the stored blob — never calls Gemini or Kalimat, so previews cost
 * no API quota no matter how widely a link spreads.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default async (request, context) => {
  const url = new URL(request.url);
  const response = await context.next();

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
  if (!share) return response;

  const lang = share.language === "Bangla" ? "Bangla" : "English";
  // Strip surrounding quotes/whitespace so titles never start with stray quotes.
  const rawClaim = String(share.claim || "").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

  // Title: keep a question as-is; turn a statement into a curiosity hook.
  // Capped to ~60 chars (the OG sweet spot; X/LinkedIn truncate beyond that).
  const hook = lang === "Bangla" ? " — এটি কি সহিহ? 🤔" : " — is it authentic? 🤔";
  const title = isQuestion(rawClaim)
    ? truncate(rawClaim, 62)
    : truncate(rawClaim, 40) + hook;

  // Description: deliberately withholds the verdict to drive the click.
  const description =
    lang === "Bangla"
      ? "কুরআন ও সহীহ হাদিসের আলোকে যাচাই করা হয়েছে। উত্তর দেখতে IsItSahih-এ ক্লিক করুন।"
      : "Checked against the Quran and authentic Hadith. Tap to see the answer on IsItSahih.";

  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const canonicalUrl = `${url.origin}/share/${id}`;
  const imageUrl = `${url.origin}/og-default.png`;

  const injected = `
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="IsItSahih — is it authentic?" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <link rel="canonical" href="${canonicalUrl}" />
  `;

  const html = await response.text();
  const out = html.replace("</head>", injected + "\n  </head>");

  return new Response(out, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};

// True if the claim already reads as a question (so we show it unchanged).
function isQuestion(s) {
  const t = String(s).trim();
  if (/[?？؟]\s*$/.test(t)) return true;
  return (
    /^(is|are|am|was|were|do|does|did|can|could|should|would|will|has|have|had|what|why|how|when|who|whom|where|which|whose|may|are there|isn't|aren't)\b/i.test(t) ||
    /^(কি|কী|কেন|কীভাবে|কিভাবে|কখন|কে|কারা|কোথায়|কোনটি|কোন)\b/.test(t) ||
    /^(هل|ما|ماذا|لماذا|كيف|متى|من|أين|أي)\b/.test(t)
  );
}

// Truncate to maxLen at a word boundary, adding an ellipsis when cut.
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  const slice = str.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

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
