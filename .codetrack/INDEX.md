# INDEX.md
_Last updated: 2026-06-17_

| File path | Feature(s) | Notes |
|-----------|-----------|-------|
| `index.tsx` | verification-core, sharing, pwa | Main app component + SW registration |
| `index.css` | verification-core | All styles |
| `index.html` | pwa | Meta tags, manifest link, apple-touch-icon |
| `public/sw.js` | pwa | Service worker — app shell cache |
| `public/manifest.webmanifest` | pwa | PWA manifest — icons, display, shortcuts |
| `public/icon-192.png` | pwa | 192×192 PNG icon (user-provided) |
| `public/icon-512.png` | pwa | 512×512 PNG icon (user-provided) |
| `vite.config.ts` | core | Build config |
| `netlify/functions/verify.ts` | verification-core | Main AI verify endpoint |
| `netlify/functions/track.ts` | pwa, sharing | Analytics event tracking (install + share_action) |
| `netlify/functions/save-result.ts` | sharing | Persist result for share URL; logs to `shares` sheet |
| `netlify/functions/get-result.ts` | sharing | Fetch shared result by ID; logs to `share_views` sheet |
| `netlify/functions/sitemap.ts` | sharing, seo | Dynamic sitemap — static pages + all share blobs |
| `netlify/edge-functions/og-inject.js` | sharing, seo | Per-share OG/Twitter/JSON-LD injection at the edge |
| `socialConfig.ts` | sharing | Social URLs config |
| `Code.gs` | analytics | Google Sheets logging backend — all tabs incl. share_actions + share_views |
| `netlify.toml` | core | Build config + edge function route for /share/* |
| `scripts/generate-icons.ps1` | pwa | Helper script to resize icons (run manually) |
