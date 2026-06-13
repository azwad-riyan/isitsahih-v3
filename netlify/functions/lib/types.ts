// Shared types for the IsItSahih server pipeline.

export type Language = "English" | "Bangla";

export type Verdict = "True" | "False" | "Uncertain";

// A single supporting reference, shaped exactly as the existing UI consumes it.
// arabic_text / translation come VERBATIM from the search APIs and are never
// rewritten by the AI. connection_explanation is the only AI-authored field.
export interface Reference {
  source: string;            // e.g. "Sahih al-Bukhari 5066" or "Quran 17:32"
  arabic_text: string;       // verbatim Arabic from the source API
  translation: string;       // verbatim translation from the source API
  connection_explanation?: string; // AI: why this reference relates to the claim
  grade?: string;            // hadith grade label, if known (Sahih/Hasan/...)
  type?: "quran" | "hadith"; // content type
  provider?: "kalimat" | "hadeethenc"; // which API supplied it (drives attribution)
}

// The result object returned to the browser and stored in share blobs.
// Mirrors what index.tsx already renders so the frontend stays unchanged.
export interface VerificationResult {
  verdict: string;                 // localized display string (e.g. "সত্য")
  verdictCanonical: Verdict;       // canonical, for logic + logging
  explanation: string;             // localized prose, no citation numbers
  references: Reference[];
  usedReferenceIndices: number[];  // which references the AI relied on
  verdictOverridden: boolean;      // integrity guard fired
  noSourcesFound: boolean;         // search returned nothing
  attributions: string[];          // provider attribution keys present, e.g. ["kalimat"]
}

// Why a request was rejected/failed (logged, never shown verbatim to the user).
export type RejectionReason =
  | "too_short"
  | "too_long"
  | "injection_attempt"
  | "upstream_error"
  | "parse_error"
  | "no_keys"
  | "unknown";
