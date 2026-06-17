# Feature: Sharing
_Created: 2026-06-17 | Last changed: 2026-06-17_

## Purpose
Allows users to share a permanent, tamper-proof link to any verification result.
Each share creates a blob in Netlify Blobs (`shares` store) and returns a
canonical `/share/:uuid` URL. The edge function `og-inject.js` rewrites OG/
Twitter/JSON-LD tags per-share so social previews and Google use the real claim
and verdict, not the homepage defaults.

## Scope
- **Files owned**: `netlify/functions/save-result.ts`, `netlify/functions/get-result.ts`,
  `netlify/edge-functions/og-inject.js`, `netlify/functions/sitemap.ts`
- **Files touched**: `index.tsx` (shareTo, ensureShareUrl, handleShareToggle),
  `netlify/functions/track.ts` (share_action event), `Code.gs` (shares + share_actions + share_views tabs)
- **External deps**: `@netlify/blobs` (persistence), Netlify Edge Functions (OG rewrite)

## Current State
- Share creation: fully implemented. `save-result.ts` persists blob + logs row to `shares` sheet.
- Share retrieval: `get-result.ts` fetches blob; now also logs viewer geo/device to `share_views` sheet.
- SEO: fully implemented via `og-inject.js` — per-share title, description, OG tags,
  ClaimReview + QAPage + BreadcrumbList JSON-LD, and SSR article body for non-JS crawlers.
- Platform logging: NOW IMPLEMENTED (see 2026-06-17 entry below).
- Share view logging: NOW IMPLEMENTED (see 2026-06-17 entry below).

## Change Log

### [2026-06-17] Add platform logging + share view tracking
**Why**: Users were sharing, but we had no way to know which platform they used (WhatsApp vs
Facebook etc.) or whether shared links were actually being opened by recipients.
**What**:
- `index.tsx` `shareTo()`: + `track("share_action", { platform, shareId })` + `gtag("event","share")`
  immediately after `ensureShareUrl()` succeeds.
- `track.ts`: + `share_action` to `ALLOWED_EVENTS`; routes to `share_actions` sheet tab
  with platform + share_id + full geo/device context from `extractClientMeta`.
- `get-result.ts`: + `context?: NetlifyContextLike` param; after successful blob fetch,
  fires non-blocking `logEvent("share_views", { share_id, referrer, ...clientMeta })`.
- `Code.gs`: + `platform` column to `shares` tab schema; + `share_actions` tab;
  + `share_views` tab; + `share_views_count` to `daily_summary`.
**How**: `track()` in `index.tsx` is already fire-and-forget (keepalive fetch). The GA4 `share`
event uses the built-in event name so it appears in GA4's default event reports without
custom dimensions. `get-result.ts` view log uses `.catch(() => {})` so blob read latency
is unaffected.
**Impact**: ~ `@index.tsx`, `@netlify/functions/track.ts`, `@netlify/functions/get-result.ts`,
`@Code.gs`; new sheets: `share_actions`, `share_views`
! After deploying, redeploy Code.gs as a new Web App version in Apps Script editor.
**Ref**: User request 2026-06-17 — "log platform + track share link visits"

---
