# PROJECT.md
_Last updated: 2026-06-17_

## Identity
- **Name**: IsItSahih
- **Purpose**: Islamic claim verification app — checks user statements against the Quran and authentic Sahih Hadith using AI + Kalimat.dev API
- **Status**: production
- **URL**: https://isitsahih.app

## Stack
- **Language(s)**: TypeScript, JavaScript
- **Framework(s)**: React 19 (via CDN importmap), Vite 6 (build)
- **Hosting**: Netlify (edge functions + blobs)
- **Key services**: Netlify Functions (verify, track, save-result, get-result), Kalimat.dev (hadith search), Google Analytics

## Architecture
- **Pattern**: Single-page app with Netlify serverless functions for all API calls
- **Entry points**: `index.tsx` (main app + SharePage), `public/sw.js` (service worker)
- **State management**: React useState/useEffect only (no external store)
- **Build output**: `dist/`

## Conventions
- **Naming**: camelCase for variables/functions, PascalCase for components
- **File layout**: everything in root (index.tsx, index.css), server logic in `netlify/functions/`
- **Error handling**: all fetch calls wrapped in try/catch, analytics must never break app
- **Testing**: none configured

## Active Features
- [x] pwa → features/pwa.md
- [ ] verification-core → features/verification-core.md
- [ ] sharing → features/sharing.md

## Critical Notes
- API keys live ONLY in Netlify env vars, never in client bundle
- SW must never cache /.netlify/* routes
- The importmap in index.html loads React from CDN (aistudiocdn.com) — this is intentional for the AI Studio preview environment but Vite also bundles locally
