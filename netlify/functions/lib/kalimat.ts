// Kalimat.dev semantic search client (v2 API).
// This is the SEARCH step — no AI involved. Text is returned verbatim and is
// never rewritten downstream, which is what makes references tamper-proof.
import type { Language, Reference } from "./types";

const BASE = "https://api.kalimat.dev/api/v2/search";

// The six canonical hadith collections (kutub al-sittah).
const HADITH_BOOKS = "bukhari,muslim,abudaud,tirmizi,nesai,ibnmaja";
// Only authentic gradings are accepted as supporting references.
const HADITH_GRADES = "sahih,hasan";

const BOOK_LABELS: Record<string, string> = {
  bukhari: "Sahih al-Bukhari",
  muslim: "Sahih Muslim",
  abudaud: "Sunan Abi Dawud",
  tirmizi: "Jami` at-Tirmidhi",
  nesai: "Sunan an-Nasa'i",
  ibnmaja: "Sunan Ibn Majah",
};

export interface KalimatSearchOutcome {
  references: Reference[];
  // Per-call diagnostics for the api_usage log.
  diagnostics: Array<{ contentType: string; status: number; count: number; ms: number }>;
}

function apiKey(): string {
  return process.env.KALIMAT_API_KEY || process.env.VITE_KALIMAT_API_KEY || "";
}

function langCode(language: Language): string {
  return language === "Bangla" ? "bn" : "en";
}

async function callKalimat(params: Record<string, string>) {
  const url = `${BASE}?${new URLSearchParams(params).toString()}`;
  const started = Date.now();
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey() } });
  const ms = Date.now() - started;
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* leave json null on parse failure */
  }
  const results: any[] = json?.data?.results ?? [];
  return { status: res.status, results, ms };
}

function mapQuran(r: any): Reference | null {
  if (r?.isTransliteration) return null; // skip transliteration rows, keep the verse
  const arabic = r?.text || "";
  const translation = r?.translatedText || "";
  if (!arabic) return null;
  return {
    source: `Quran ${r.id}`,
    arabic_text: arabic,
    translation,
    type: "quran",
    provider: "kalimat",
  };
}

function mapHadith(r: any): Reference | null {
  const arabic = r?.text || r?.matnAr || "";
  const translation = r?.translatedText || r?.matnEn || "";
  if (!arabic) return null;
  const bookKey = (r?.sourceBook || "").toString().toLowerCase();
  const bookLabel = BOOK_LABELS[bookKey] || r?.sourceBookAr || r?.sourceBook || "Hadith";
  const num = r?.hadithNumber != null ? ` ${r.hadithNumber}` : "";
  return {
    source: `${bookLabel}${num}`,
    arabic_text: arabic,
    translation,
    grade: r?.gradeEn || r?.gradeAr || undefined,
    type: "hadith",
    provider: "kalimat",
  };
}

/**
 * Search Quran + the six hadith books in parallel and return mapped references.
 * Never throws for an individual upstream failure — a failed leg just yields
 * no references and is recorded in diagnostics.
 */
export async function searchKalimat(
  claim: string,
  language: Language,
  perType = 10,
): Promise<KalimatSearchOutcome> {
  const userLang = langCode(language);

  const quranParams = {
    query: claim,
    contentType: "quran",
    getText: "true",
    numResults: String(perType),
    userLang,
  };
  const sunnahParams = {
    query: claim,
    contentType: "sunnah",
    getText: "true",
    getMetadata: "true",
    hadithSourceBook: HADITH_BOOKS,
    hadithGrade: HADITH_GRADES,
    numResults: String(perType),
    userLang,
  };

  const [quran, sunnah] = await Promise.all([
    callKalimat(quranParams).catch(() => ({ status: 0, results: [], ms: 0 })),
    callKalimat(sunnahParams).catch(() => ({ status: 0, results: [], ms: 0 })),
  ]);

  const quranRefs = quran.results.map(mapQuran).filter(Boolean) as Reference[];
  const hadithRefs = sunnah.results.map(mapHadith).filter(Boolean) as Reference[];

  // Interleave so the AI sees a balanced mix rather than all-Quran-then-all-hadith.
  const references: Reference[] = [];
  const max = Math.max(quranRefs.length, hadithRefs.length);
  for (let i = 0; i < max; i++) {
    if (hadithRefs[i]) references.push(hadithRefs[i]);
    if (quranRefs[i]) references.push(quranRefs[i]);
  }

  return {
    references,
    diagnostics: [
      { contentType: "quran", status: quran.status, count: quranRefs.length, ms: quran.ms },
      { contentType: "sunnah", status: sunnah.status, count: hadithRefs.length, ms: sunnah.ms },
    ],
  };
}
