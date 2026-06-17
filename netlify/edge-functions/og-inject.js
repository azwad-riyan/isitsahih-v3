/**
 * netlify/edge-functions/og-inject.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on /share/:id. Three jobs:
 *
 *  1. HEAD — replaces the generic <title> and <meta name="description"> with
 *     per-share values that reveal the verdict (good for search ranking).
 *     Also injects OG/Twitter tags that TEASE the claim without spoiling the
 *     verdict (good for social-share CTR). These serve different audiences;
 *     it is not cloaking because the body content also reveals the verdict.
 *
 *  2. STRUCTURED DATA — injects ClaimReview + QAPage + BreadcrumbList JSON-LD
 *     so Google can surface a Fact Check label and QA rich results.
 *
 *  3. BODY — injects server-rendered semantic HTML into <div id="root"> so
 *     Googlebot and non-JS crawlers (GPTBot, PerplexityBot, ClaudeBot) can
 *     read the claim, verdict, explanation, and hadith references without
 *     executing JavaScript. React replaces this content on hydration.
 *
 * Reads ONLY the stored blob — never calls Gemini or Kalimat, so previews
 * cost no API quota no matter how widely a link spreads.
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
    const res = await fetch(
      `${url.origin}/.netlify/functions/get-result?id=${encodeURIComponent(id)}`
    );
    if (!res.ok) return response;
    const data = await res.json();
    share = data && data.share;
  } catch {
    return response;
  }
  if (!share) return response;

  const isBangla = share.language === "Bangla";
  const origin = url.origin;

  // Strip surrounding quotes/whitespace so titles never start with stray quotes.
  const rawClaim = String(share.claim || "")
    .trim()
    .replace(/^["'""'']+|["'""'']+$/g, "")
    .trim();

  const result     = share.result || {};
  const verdict    = String(result.verdict || "").trim();
  const explanation = String(result.explanation || "").trim();
  const references  = Array.isArray(result.references) ? result.references : [];
  const createdAt   = share.createdAt || new Date().toISOString();
  const canonicalUrl = `${origin}/share/${id}`;
  const imageUrl     = `${origin}/og-default.png`;

  // Human-readable verdict word used in title and schema.
  const verdictWord = getVerdictWord(verdict, isBangla);

  // ── SEO TITLE (for <title> — shown in Google search results) ──────────────
  // Reveals the verdict: searchers want "Is X sahih?" answered in the snippet.
  const seoTitle = `${truncate(rawClaim, 55)} — ${verdictWord} | IsItSahih`;

  // ── SEO META DESCRIPTION ──────────────────────────────────────────────────
  const seoDescription = isBangla
    ? `রায়: ${verdictWord}। ${truncate(explanation, 110)} কুরআন ও সহীহ হাদিসের আলোকে যাচাই — IsItSahih।`
    : `Verdict: ${verdictWord}. ${truncate(explanation, 110)} Verified against the Quran and authentic Hadith — IsItSahih.`;

  // ── SOCIAL OG/TWITTER TITLE (teases, never spoils) ───────────────────────
  const hook = isBangla ? " — এটি কি সহিহ? 🤔" : " — is it authentic? 🤔";
  const socialTitle = isQuestion(rawClaim)
    ? truncate(rawClaim, 62)
    : truncate(rawClaim, 40) + hook;

  // ── SOCIAL OG/TWITTER DESCRIPTION (withholds verdict for curiosity) ───────
  const socialDescription = isBangla
    ? "কুরআন ও সহীহ হাদিসের আলোকে যাচাই করা হয়েছে। উত্তর দেখতে IsItSahih-এ ক্লিক করুন।"
    : "Checked against the Quran and authentic Hadith. Tap to see the answer on IsItSahih.";

  const t  = escapeHtml(socialTitle);
  const d  = escapeHtml(socialDescription);
  const st = escapeHtml(seoTitle);
  const sd = escapeHtml(seoDescription);
  const cu = escapeHtml(canonicalUrl);

  // ── HEAD INJECTION ────────────────────────────────────────────────────────
  const jsonLd = buildJsonLd(
    rawClaim, verdict, verdictWord, explanation, references,
    createdAt, canonicalUrl, origin, isBangla
  );

  const headInjection = `
    <meta property="og:type" content="article" />
    <meta property="article:published_time" content="${escapeHtml(createdAt)}" />
    <meta property="article:author" content="IsItSahih" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${cu}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="IsItSahih — is it authentic?" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <link rel="canonical" href="${cu}" />
    <script type="application/ld+json">${jsonLd}</script>`;

  // ── BODY INJECTION ────────────────────────────────────────────────────────
  // Inserted inside <div id="root"> so React replaces it on hydration.
  // Non-JS crawlers see the full Q&A; human visitors see the React UI.
  const ssrBody = buildSsrBody(
    rawClaim, verdictWord, explanation, references,
    canonicalUrl, origin, createdAt, isBangla
  );

  const html = await response.text();
  const out = html
    // Per-share <title> (replaces generic homepage title)
    .replace(/<title>[^<]*<\/title>/, `<title>${st}</title>`)
    // Per-share <meta name="description"> (replaces generic homepage description)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${sd}" />`)
    // Inject OG tags + canonical + JSON-LD into <head>
    .replace("</head>", headInjection + "\n  </head>")
    // Inject SSR article body inside #root (React hydrates over this)
    .replace('<div id="root"></div>', `<div id="root">${ssrBody}</div>`);

  return new Response(out, {
    status: response.status,
    headers: {
      ...Object.fromEntries(response.headers),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    },
  });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVerdictWord(verdict, isBangla) {
  const v = verdict.toLowerCase();
  if (v.includes("true") || v.includes("sahih") || v.includes("সত্য"))
    return isBangla ? "সত্য (সহিহ)" : "Authentic (True)";
  if (v.includes("false") || v.includes("fabricated") || v.includes("মিথ্যা"))
    return isBangla ? "মিথ্যা (অসহিহ)" : "Not Authentic (False)";
  return isBangla ? "অনিশ্চিত" : "Uncertain";
}

function getClaimReviewRating(verdict) {
  const v = verdict.toLowerCase();
  if (v.includes("true") || v.includes("sahih") || v.includes("সত্য")) return 1;
  if (v.includes("false") || v.includes("fabricated") || v.includes("মিথ্যা")) return -1;
  return 0;
}

function buildSsrBody(rawClaim, verdictWord, explanation, references, canonicalUrl, origin, createdAt, isBangla) {
  const refsHtml = references
    .map((ref) => {
      const source = escapeHtml(String(ref.source || ""));
      const grade  = ref.grade ? ` · ${escapeHtml(String(ref.grade))}` : "";
      const arabic = ref.arabic_text
        ? `<p lang="ar" dir="rtl">${escapeHtml(String(ref.arabic_text))}</p>`
        : "";
      const translation = ref.translation
        ? `<p>${escapeHtml(String(ref.translation))}</p>`
        : "";
      const connection = ref.connection_explanation
        ? `<p><em>${escapeHtml(String(ref.connection_explanation))}</em></p>`
        : "";
      return `<blockquote><cite>${source}${grade}</cite>${arabic}${translation}${connection}</blockquote>`;
    })
    .join("");

  const refsSection = references.length > 0
    ? `<section><h2>${isBangla ? "প্রাসঙ্গিক প্রমাণসমূহ" : "Supporting References"}</h2>${refsHtml}</section>`
    : "";

  const disclaimer = isBangla
    ? "এটি একটি শিক্ষামূলক তথ্য-সহায়িকা, ফতোয়া নয়। ব্যক্তিগত ধর্মীয় বিধানের জন্য একজন যোগ্য আলেমের পরামর্শ নিন।"
    : "Educational reference only — not a fatwa. Consult a qualified Islamic scholar for personal religious rulings.";

  return `<article itemscope itemtype="https://schema.org/Article">
    <h1 itemprop="name">${escapeHtml(rawClaim)}</h1>
    <section>
      <h2>${isBangla ? "রায়" : "Verdict"}: ${escapeHtml(verdictWord)}</h2>
      <p itemprop="description">${escapeHtml(explanation)}</p>
    </section>
    ${refsSection}
    <footer>
      <p>${escapeHtml(disclaimer)}</p>
      <p>${isBangla ? "যাচাই করেছে" : "Verified by"}: <a href="${escapeHtml(origin)}/">IsItSahih</a>
         &nbsp;·&nbsp; ${isBangla ? "উৎস" : "Source"}: <a href="https://kalimat.dev" rel="noopener noreferrer">Kalimat.dev</a></p>
    </footer>
  </article>`;
}

function buildJsonLd(rawClaim, verdict, verdictWord, explanation, references, createdAt, canonicalUrl, origin, isBangla) {
  const ratingValue    = getClaimReviewRating(verdict);
  const verdictWordEn  = getVerdictWord(verdict, false); // always English for schema
  const answerText     = verdict ? `${verdictWordEn}: ${explanation}` : explanation;
  const claimTruncated = rawClaim.length > 110 ? rawClaim.slice(0, 107) + "…" : rawClaim;

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ClaimReview",
        "url": canonicalUrl,
        "datePublished": createdAt,
        "claimReviewed": rawClaim,
        "author": {
          "@type": "Organization",
          "@id": `${origin}/#organization`,
          "name": "IsItSahih",
          "url": `${origin}/`,
        },
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": ratingValue,
          "bestRating": 1,
          "worstRating": -1,
          "alternateName": verdictWordEn,
        },
        "itemReviewed": {
          "@type": "Claim",
          "name": rawClaim,
          "appearance": {
            "@type": "CreativeWork",
            "author": { "@type": "Person", "name": "Unknown" },
          },
        },
      },
      {
        "@type": "QAPage",
        "@id": canonicalUrl,
        "url": canonicalUrl,
        "name": claimTruncated,
        "datePublished": createdAt,
        "inLanguage": isBangla ? "bn" : "en",
        "isPartOf": { "@id": `${origin}/#website` },
        "publisher": { "@id": `${origin}/#organization` },
        "mainEntity": {
          "@type": "Question",
          "name": rawClaim,
          "text": rawClaim,
          "datePublished": createdAt,
          "answerCount": 1,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": answerText,
            "datePublished": createdAt,
            "url": canonicalUrl,
            "upvoteCount": 1,
            "author": {
              "@type": "Organization",
              "@id": `${origin}/#organization`,
              "name": "IsItSahih",
            },
          },
        },
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "IsItSahih", "item": `${origin}/` },
          { "@type": "ListItem", "position": 2, "name": claimTruncated, "item": canonicalUrl },
        ],
      },
    ],
  };

  return JSON.stringify(graph);
}

// True if the claim already reads as a question.
function isQuestion(s) {
  const t = String(s).trim();
  if (/[?？؟]\s*$/.test(t)) return true;
  return (
    /^(is|are|am|was|were|do|does|did|can|could|should|would|will|has|have|had|what|why|how|when|who|whom|where|which|whose|may|are there|isn't|aren't)\b/i.test(t) ||
    /^(কি|কী|কেন|কীভাবে|কিভাবে|কখন|কে|কারা|কোথায়|কোনটি|কোন)\b/.test(t) ||
    /^(هل|ما|ماذا|لماذا|كيف|متى|من|أين|أي)\b/.test(t)
  );
}

// Truncate to maxLen at a word boundary, appending ellipsis when cut.
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
