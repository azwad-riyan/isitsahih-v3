
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { socialConfig } from "./socialConfig";

// --- CONSTANTS ---
const MIN_LEN = 10;
const MAX_LEN = 500;

// Social share targets shown in the share menu. Each opens the platform's
// standard share intent with the permanent result link (+ a short message).
const brandIcon = (path: string) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true">
    <path d={path} />
  </svg>
);
const SHARE_TARGETS = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    bg: "#25D366",
    icon: brandIcon(
      "M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z",
    ),
  },
  {
    key: "facebook",
    label: "Facebook",
    bg: "#1877F2",
    icon: brandIcon(
      "M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z",
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    bg: "#0088CC",
    icon: brandIcon(
      "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.751-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
    ),
  },
  {
    key: "x",
    label: "X",
    bg: "#000000",
    icon: brandIcon(
      "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
    ),
  },
] as const;

// --- TYPE DEFINITIONS ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  language: string;
}

// --- SESSION ID (correlates a request with its share, server-side logs) ---
const getSessionId = (): string => {
  try {
    let id = localStorage.getItem("iss_session_id");
    if (!id) {
      id =
        (crypto as any)?.randomUUID?.() ||
        Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem("iss_session_id", id);
    }
    return id;
  } catch {
    return "anon";
  }
};

// --- ANALYTICS (PWA install + launch) ---
// Fire-and-forget client event → /track → Google Sheets `client_events` tab.
// This is how install/usage is measured: see `app_installed` (the install moment)
// and `launch_standalone` (sessions opened from the installed icon) in that sheet.
const track = (event: string, extra: Record<string, string> = {}) => {
  try {
    fetch("/.netlify/functions/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sessionId: getSessionId(), ...extra }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never break the app */
  }
};

// True when the app is running as an installed PWA (Android/desktop standalone
// or iOS "Add to Home Screen").
const isStandalone = (): boolean => {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true
    );
  } catch {
    return false;
  }
};

// --- COMPONENTS ---

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, language }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes the modal; move focus to the close button on open so keyboard
  // and screen-reader users land inside the dialog.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button
            ref={closeRef}
            className="modal-close"
            onClick={onClose}
            aria-label={language === "Bangla" ? "বন্ধ করুন" : "Close"}
          >
            &times;
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

const ReferenceItem: React.FC<{ refData: any; language: string }> = ({ refData, language }) => {
  const [showExplanation, setShowExplanation] = useState(false);
  const sourceDisplay = refData.source;

  return (
    <div className="reference-item">
      <div className="reference-header">
        <p className="reference-source">
          {sourceDisplay}
          {refData.grade && (
            <span style={{ marginInlineStart: 8, fontSize: "0.72rem", opacity: 0.7 }}>
              · {refData.grade}
            </span>
          )}
        </p>
        {refData.connection_explanation && (
          <button
            className="explanation-toggle"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            {language === "Bangla" ? "ব্যাখ্যা দেখুন" : "Explain Relevance"}
          </button>
        )}
      </div>

      {showExplanation && refData.connection_explanation && (
        <div className="reference-explanation">
          {refData.connection_explanation}
        </div>
      )}

      <div className="reference-content">
        <p className="reference-arabic">{refData.arabic_text}</p>
        <p className="reference-translation">{refData.translation}</p>
      </div>

      {/* Source attribution — required at the bottom of each provider's result portion */}
      {refData.provider === "kalimat" && (
        <p className="reference-attribution" style={{ fontSize: "0.7rem", opacity: 0.65, marginTop: "0.5rem" }}>
          Powered by{" "}
          <a href="https://kalimat.dev" target="_blank" rel="noopener noreferrer">Kalimat.dev</a>
        </p>
      )}
    </div>
  );
};

const LanguageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.02-.03zm-1.8-12.91h.01z" />
  </svg>
);

const SahihLogo = () => (
  <svg className="app-logo-svg" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M384 96v320H152c-29.35 0-48.47 17.51-54.33 41.05C94.48 448.2 92.27 439.1 92.27 439.1c-2.3-9.5-12-15.1-21.5-12.8s-15.1 12-12.8 21.5l14 58c1.6 6.7 7.7 11.3 14.5 11.3h337.5c8.8 0 16-7.2 16-16V96c0-8.8-7.2-16-16-16h-40zM152 48h240c26.5 0 48 21.5 48 48v352h-24V96h-16v304h-16V96h-16v304h-16V96h-16v304h-16V96h-16v304h-16V96h-16v304h-16V96h-16v304h-16V96h-24v316.5c-7.3-1.6-14.8-2.5-22.5-2.5-35.3 0-64 28.7-64 64 0 3.8.3 7.6.9 11.3-1.3-.2-2.7-.3-4-.3-26.5 0-48-21.5-48-48V96c0-26.5 21.5-48 48-48z" />
  </svg>
);

// Verdict colour + icon, derived from the (possibly localized) verdict string.
const getVerdictInfo = (verdict: string) => {
  const v = (verdict || "").toLowerCase();
  if (v.includes("true") || v.includes("সত্য") || v.includes("sahih")) {
    return {
      className: "verdict-true",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    };
  } else if (v.includes("false") || v.includes("মিথ্যা") || v.includes("জাল") || v.includes("fabricated")) {
    return {
      className: "verdict-false",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    };
  }
  return {
    className: "verdict-neutral",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
      </svg>
    ),
  };
};

// Shared read-only renderer for a verification result (used by the main app and
// the /share page so a shared result looks identical to a fresh one).
const ResultView: React.FC<{ result: any; language: string }> = ({ result, language }) => {
  if (!result) return null;
  const verdictInfo = getVerdictInfo(result.verdict || "");

  return (
    <div className="result-container">
      <div className={`verdict-card ${verdictInfo.className}`}>
        <div className="verdict-icon">{verdictInfo.icon}</div>
        <div className="verdict-content">
          <div className="verdict-header-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="verdict-main-text">{result.verdict}</h2>
            {result.cached && (
              <span style={{ fontSize: '0.6rem', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px', opacity: 0.7 }}>
                {language === "Bangla" ? "পূর্বে যাচাইকৃত" : "Previously checked"}
              </span>
            )}
          </div>
          <p className="verdict-explanation">{result.explanation}</p>
        </div>
      </div>

      <p className="result-disclaimer">
        {language === "Bangla"
          ? "এটি একটি শিক্ষামূলক টুল, কোনো ফতোয়া নয়। আমরা নিচের প্রকৃত উৎসগুলো তুলে ধরি যাতে আপনি নিজে পড়ে বুঝতে পারেন। নিশ্চিত সিদ্ধান্তের জন্য একজন যোগ্য আলেমের পরামর্শ নিন।"
          : "This is an educational tool, not a fatwa. We surface the actual sources below so you can read and judge for yourself. For a definitive ruling, please consult a qualified scholar."}
      </p>

      {result.references && result.references.length > 0 && (
        <>
          <h3 className="references-title">
            {language === "Bangla" ? "প্রাসঙ্গিক প্রমাণসমূহ" : "Supporting References"}
          </h3>
          <div className="references-list">
            {result.references.map((ref: any, index: number) => (
              <ReferenceItem key={index} refData={ref} language={language} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Read-only page for a shared result link: /share/:id
const SharePage: React.FC<{ id: string }> = ({ id }) => {
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<any>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/.netlify/functions/get-result?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!active) return;
        if (data && data.ok && data.share) setShare(data.share);
        else setFailed(true);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const language = share?.language === "Bangla" ? "Bangla" : "English";

  return (
    <div className="container">
      <header className="header">
        <a href="/" className="brand-link" aria-label={language === "Bangla" ? "হোম পেজে যান" : "Go to home page"}>
          <div className="header-logo-container"><SahihLogo /></div>
          <div className="header-title-container"><h1 className="title">Is It Sahih</h1></div>
        </a>
        <div className="header-actions" />
      </header>
      <main role="main">
        {loading && (
          <div className="loading-container" style={{ justifyContent: "center", padding: "3rem 0" }}>
            <div className="spinner"></div>
          </div>
        )}

        {!loading && failed && (
          <div className="error-message">
            {language === "Bangla"
              ? "এই ফলাফলের লিংকটি সঠিক নয় বা মেয়াদ শেষ হয়ে গেছে।"
              : "This result link is invalid or has expired."}
          </div>
        )}

        {!loading && share && (
          <>
            <div
              className="share-banner"
              style={{ background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.25)", borderRadius: 10, padding: "0.75rem 1rem", fontSize: "0.85rem", margin: "0.5rem 0 1rem" }}
            >
              {language === "Bangla" ? "শেয়ারকৃত ফলাফল" : "Shared result"}
              {share.createdAt ? ` — ${new Date(share.createdAt).toLocaleDateString()}` : ""}.{" "}
              <span style={{ opacity: 0.8 }}>
                {language === "Bangla"
                  ? "IsItSahih দ্বারা তৈরি এবং পরিবর্তন করা হয়নি।"
                  : "Generated by IsItSahih and not modified."}
              </span>
            </div>

            {share.claim && (
              <p className="description" style={{ fontStyle: "italic" }}>"{share.claim}"</p>
            )}

            <ResultView result={share.result} language={language} />

            <a
              href="/"
              className="submit-button"
              style={{ display: "block", textAlign: "center", marginTop: "1.5rem", textDecoration: "none" }}
            >
              {language === "Bangla" ? "নিজের দাবি যাচাই করুন →" : "Verify your own claim →"}
            </a>
          </>
        )}
      </main>
      <footer className="footer">
        <p className="source-credit" style={{ fontSize: "0.72rem", opacity: 0.7, textAlign: "center", margin: "1rem 0" }}>
          {language === "Bangla" ? "উৎস: " : "Source: "}
          <a href="https://kalimat.dev" target="_blank" rel="noopener noreferrer">Kalimat.dev</a>
        </p>
      </footer>
    </div>
  );
};


const App = () => {
  const [claim, setClaim] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Remember the user's language choice across visits.
  const [language, setLanguage] = useState<string>(() => {
    try {
      return localStorage.getItem("iss_language") === "Bangla" ? "Bangla" : "English";
    } catch {
      return "English";
    }
  });
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [shareState, setShareState] = useState("idle"); // idle|saving|copied|error
  const [shareUrl, setShareUrl] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  // PWA install prompt (Chrome/Edge/Android). null until the browser offers it.
  const [installEvent, setInstallEvent] = useState<any>(null);

  // Modal States
  const [showAbout, setShowAbout] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const languages = ["English", "Bangla"];

  // Persist language whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem("iss_language", language);
    } catch {
      /* ignore */
    }
  }, [language]);

  const genericError =
    language === "Bangla"
      ? "দুঃখিত, এই মুহূর্তে যাচাই করা সম্ভব হয়নি। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।"
      : "Sorry, we couldn't verify this right now. Please try again in a moment.";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (shareRef.current && !shareRef.current.contains(event.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- PWA install + launch analytics ---
  // Log how the app was opened (installed icon vs browser), and wire up the
  // install prompt so we can offer a button and record the outcome.
  useEffect(() => {
    track(isStandalone() ? "launch_standalone" : "launch_browser", {
      displayMode: isStandalone() ? "standalone" : "browser",
    });

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stash it so we can trigger the prompt from our own button
      setInstallEvent(e);
      track("install_prompt_available");
    };
    const onInstalled = () => {
      setInstallEvent(null);
      track("app_installed");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Bring the result into view (and focus it) once it arrives, so users on
  // mobile don't miss the answer that renders below the fold.
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      resultRef.current.focus();
    }
  }, [result]);

  const handleInstallClick = async () => {
    if (!installEvent) return;
    track("install_prompt_shown");
    installEvent.prompt();
    try {
      const choice = await installEvent.userChoice;
      track(choice?.outcome === "accepted" ? "install_accepted" : "install_dismissed");
    } catch {
      /* ignore */
    }
    setInstallEvent(null);
  };

  const handleCheckAnother = () => {
    setClaim("");
    setResult(null);
    setError("");
    setShareUrl("");
    setShareState("idle");
    setShareOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    textareaRef.current?.focus();
  };

  // --- CLIENT CACHE (saves repeat function calls / quota) ---
  const getCacheKey = (text: string, lang: string) =>
    `sahih_cache_${lang}_${text.trim().toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  const getCachedResult = (text: string, lang: string) => {
    try {
      const cached = localStorage.getItem(getCacheKey(text, lang));
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  };

  const saveCachedResult = (text: string, lang: string, data: any) => {
    try {
      localStorage.setItem(getCacheKey(text, lang), JSON.stringify({ ...data, cached: true }));
    } catch {
      /* ignore quota errors */
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (formRef.current) {
        formRef.current.requestSubmit();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = claim.trim();
    if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN) return;

    const formEl = e.currentTarget;
    const honeypot = new FormData(formEl).get("bot-field");
    if (honeypot) return;

    setLoading(true);
    setResult(null);
    setError("");
    setShareUrl("");
    setShareState("idle");
    setShareOpen(false);

    // 1. CHECK CACHE
    const cached = getCachedResult(trimmed, language);
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    // 2. CALL SERVER PIPELINE (keys + search + verdict all server-side)
    try {
      const res = await fetch("/.netlify/functions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: trimmed, language, sessionId: getSessionId() }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* fall through to generic error */
      }

      if (!data || !data.ok || !data.result) {
        setError(genericError);
      } else {
        saveCachedResult(trimmed, language, data.result);
        setResult(data.result);
      }
    } catch {
      setError(genericError);
    } finally {
      setLoading(false);
    }
  };

  const Header = () => (
    <header className="header">
      {/* Grid Items 1 & 2: Logo + title — clickable, returns to a fresh home view */}
      <a href="/" className="brand-link" aria-label={language === "Bangla" ? "হোম পেজে যান" : "Go to home page"}>
        <div className="header-logo-container">
          {/* Use SVG component instead of img tag to ensure display even without file */}
          <SahihLogo />
        </div>
        <div className="header-title-container">
          <h1 className="title">Is It Sahih</h1>
        </div>
      </a>

      {/* Grid Item 3: Menu on the far right */}
      <div className="header-actions">
        <div className="menu-container" ref={menuRef}>
          <button
            className="menu-button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Change Language"
          >
            <LanguageIcon />
          </button>
          {isMenuOpen && (
            <div className="menu-dropdown">
              {languages.map((lang) => (
                <button
                  key={lang}
                  className="menu-item"
                  onClick={() => {
                    setLanguage(lang);
                    setIsMenuOpen(false);
                  }}
                >
                  {lang} {language === lang && "✓"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );

  const Footer = () => (
    <footer className="footer">
      {/* 1. Highlighted "How to Use" Button at the Top */}
      <button className="footer-highlight-btn" onClick={() => setShowHowToUse(true)}>
        {language === "Bangla" ? "ব্যবহারবিধি" : "How to Use"}
      </button>

      {/* 2. Social Icons in the Middle */}
      <div className="social-links">
        <a href={socialConfig.facebook} target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="Facebook">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>
        </a>
        <a href={socialConfig.instagram} target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="Instagram">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
        </a>
        <a href={socialConfig.youtube} target="_blank" rel="noopener noreferrer" className="social-icon" aria-label="YouTube">
          <svg fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" /></svg>
        </a>
      </div>

      {/* 3. About & Verify Links Below */}
      <div className="footer-links">
        <button className="footer-link" onClick={() => setShowAbout(true)}>
          {language === "Bangla" ? "আমাদের সম্পর্কে" : "About Us"}
        </button>
        <button className="footer-link" onClick={() => setShowMethodology(true)}>
          {language === "Bangla" ? "যাচাই পদ্ধতি" : "How We Verify"}
        </button>
      </div>

      <div className="contact-section">
        <p>
          {language === "Bangla" ? "যোগাযোগ: " : "Contact: "}
          <a href={`mailto:${socialConfig.email}`} className="contact-email">{socialConfig.email}</a>
        </p>
        <p className="contact-highlight">
          {language === "Bangla"
            ? "যদি কোনো ভুল বা অসঙ্গতি লক্ষ্য করেন, দয়া করে আমাদের ই-মেইলে জানান।"
            : "If you find any incorrect information or tools, please report it to us immediately."}
        </p>
      </div>

      {/* Source attribution (always visible) */}
      <p className="source-credit" style={{ fontSize: "0.72rem", opacity: 0.7, textAlign: "center", margin: "0.75rem 0" }}>
        {language === "Bangla" ? "উৎস: " : "Source: "}
        <a href="https://kalimat.dev" target="_blank" rel="noopener noreferrer">Kalimat.dev</a>
      </p>

      <div className="support-section">
        <a
          href={socialConfig.patreon}
          target="_blank"
          rel="noopener noreferrer"
          className="donate-button-footer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
          {language === "Bangla" ? "সহায়তা করুন" : "Support Us"}
        </a>
        <p className="copyright">© 2024 Is It Sahih. {language === "Bangla" ? "সর্বস্বত্ব সংরক্ষিত।" : "All rights reserved."}</p>
      </div>
    </footer>
  );

  // --- SHARE ---
  // Every verification is already persisted server-side, so the result usually
  // carries a permanent shareUrl. ensureShareUrl returns it instantly; only
  // older cached results (saved before this change) fall back to save-result.
  const ensureShareUrl = async (): Promise<string> => {
    if (result?.shareUrl) return result.shareUrl;
    if (shareUrl) return shareUrl;
    setShareState("saving");
    const res = await fetch("/.netlify/functions/save-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim: claim.trim(),
        result,
        language,
        sessionId: getSessionId(),
      }),
    });
    const data = await res.json();
    if (!data || !data.ok || !data.shareUrl) throw new Error("save failed");
    setShareUrl(data.shareUrl);
    setShareState("idle");
    return data.shareUrl;
  };

  const shareMessage = () => {
    const v = result?.verdict || "";
    return language === "Bangla"
      ? `"${claim.trim()}" — ফলাফল: ${v}\nIsItSahih দিয়ে কুরআন ও সহীহ হাদিসের আলোকে যাচাই করুন:`
      : `"${claim.trim()}" — Verdict: ${v}\nVerified against the Quran & authentic Hadith on IsItSahih:`;
  };

  const handleShareToggle = async () => {
    if (!result) return;
    setShareOpen((o) => !o);
    // Warm the link up front so platform clicks open instantly.
    if (!result.shareUrl && !shareUrl) {
      try { await ensureShareUrl(); } catch { setShareState("error"); }
    }
  };

  const shareTo = async (target: "whatsapp" | "facebook" | "telegram" | "x" | "copy" | "native") => {
    try {
      const url = await ensureShareUrl();
      const text = shareMessage();
      const eu = encodeURIComponent(url);
      const et = encodeURIComponent(text);
      if (target === "copy") {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
        return;
      }
      if (target === "native" && (navigator as any).share) {
        await (navigator as any).share({ title: "IsItSahih", text, url });
        setShareOpen(false);
        return;
      }
      const links: Record<string, string> = {
        whatsapp: `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${eu}&quote=${et}`,
        telegram: `https://t.me/share/url?url=${eu}&text=${et}`,
        x: `https://twitter.com/intent/tweet?text=${et}&url=${eu}`,
      };
      const href = links[target];
      if (href) {
        window.open(href, "_blank", "noopener,noreferrer");
        setShareOpen(false);
      }
    } catch {
      setShareState("error");
    }
  };

  const shareTriggerLabel = () => {
    if (shareState === "saving") return language === "Bangla" ? "লিংক তৈরি হচ্ছে..." : "Preparing link...";
    if (shareState === "error") return language === "Bangla" ? "আবার চেষ্টা করুন" : "Try again";
    return language === "Bangla" ? "শেয়ার করুন" : "Share";
  };

  const trimmedLen = claim.trim().length;
  const lengthValid = trimmedLen >= MIN_LEN && trimmedLen <= MAX_LEN;
  const counterColor = claim.length > MAX_LEN ? "#ef4444" : "#9ca3af";

  return (
    <div className="container">
      <Header />
      <main role="main" aria-label="Islamic Verification Tool">
        {/* The visible brand title in the header is the page's single <h1>.
            This keyword-rich line is kept for SEO/screen-reader context only. */}
        <p className="sr-only">Verify Islamic Claims with Quran and Sahih Hadith</p>
        <div className="sr-only" role="contentinfo">
          IsItSahih verifies Islamic statements strictly against the Quran and authentic Sahih Hadith collections.
          This educational tool provides references from trusted Islamic sources.
          Not intended as religious legal advice or fatwa. Consult qualified Islamic scholars for personal rulings.
        </div>

        {/* Install affordance — only when the browser offers it and we're not already installed */}
        {installEvent && !isStandalone() && (
          <div className="install-banner">
            <span>
              {language === "Bangla"
                ? "অ্যাপটি ইনস্টল করে যেকোনো সময় ব্যবহার করুন।"
                : "Install the app for quick access anytime."}
            </span>
            <button type="button" onClick={handleInstallClick}>
              {language === "Bangla" ? "ইনস্টল করুন" : "Install app"}
            </button>
            <button
              type="button"
              className="install-dismiss"
              onClick={() => setInstallEvent(null)}
              aria-label={language === "Bangla" ? "বন্ধ করুন" : "Dismiss"}
            >
              {language === "Bangla" ? "পরে" : "Not now"}
            </button>
          </div>
        )}

        <section aria-labelledby="verification-section">
          <h2 id="verification-section" className="sr-only">Claim Verification Section</h2>
          <p className="description">
            {language === "Bangla"
              ? "কুরআন এবং সহীহ হাদিসের আলোকে যাচাই করতে আপনার প্রশ্নটি লিখুন।"
              : "Enter an Islamic claim or statement to verify its authenticity against the Quran and authentic Hadith."}
          </p>
          <form ref={formRef} onSubmit={handleSubmit}>
            <p className="hidden" style={{ display: 'none' }}>
              <label>Don't fill this out if you're human: <input name="bot-field" /></label>
            </p>

            <textarea
              ref={textareaRef}
              name="claim"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={language === "Bangla" ? "উদাহরণ: 'জ্ঞান অর্জন করা কি প্রত্যেক মুসলিমের জন্য ফরজ?'" : "e.g., 'Is it true that seeking knowledge is obligatory for every Muslim?'"}
              className="claim-input"
              aria-label="Claim input"
              maxLength={MAX_LEN + 50}
              required
            />
            <div
              className="char-counter"
              style={{ textAlign: "end", fontSize: "0.75rem", color: counterColor, margin: "0.25rem 0 0.5rem" }}
            >
              {claim.length}/{MAX_LEN}
            </div>
            {trimmedLen > 0 && trimmedLen < MIN_LEN && (
              <p className="input-hint">
                {language === "Bangla"
                  ? `সম্পূর্ণ প্রশ্ন লিখুন (কমপক্ষে ${MIN_LEN}টি অক্ষর)।`
                  : `Please write a full question (at least ${MIN_LEN} characters).`}
              </p>
            )}
            <button
              type="submit"
              className="submit-button"
              disabled={loading || !lengthValid}
            >
              {loading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <span className="loading-text">
                    {language === "Bangla" ? "যাচাই করা হচ্ছে..." : "Checking…"}
                  </span>
                </div>
              ) : (language === "Bangla" ? "সত্যতা যাচাই করুন" : "Check Authenticity")}
            </button>
          </form>
          {error && <div className="error-message">{error}</div>}
          {result && (
            <div ref={resultRef} tabIndex={-1} style={{ outline: "none" }}>
              <ResultView result={result} language={language} />
            </div>
          )}
          {result && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1.25rem" }}>
              <div ref={shareRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  className="share-button"
                  onClick={handleShareToggle}
                  aria-haspopup="true"
                  aria-expanded={shareOpen}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "0.6rem 1.25rem", borderRadius: 10, cursor: "pointer",
                    border: "1px solid var(--primary-color, #0d9488)",
                    background: "transparent", color: "var(--primary-color, #0d9488)",
                    fontWeight: 600, fontSize: "0.9rem",
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width="18" height="18">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
                  </svg>
                  {shareTriggerLabel()}
                </button>

                {shareOpen && (
                  <div
                    className="share-menu"
                    role="menu"
                    style={{
                      position: "absolute", left: "50%", transform: "translateX(-50%)",
                      top: "calc(100% + 8px)", zIndex: 20,
                      background: "var(--card-bg, #fff)", borderRadius: 14,
                      boxShadow: "0 10px 30px rgba(0,0,0,0.18)", border: "1px solid rgba(0,0,0,0.08)",
                      padding: "0.85rem", minWidth: 268,
                    }}
                  >
                    <p style={{ margin: "0 0 0.6rem", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.6, textAlign: "center" }}>
                      {language === "Bangla" ? "এই ফলাফল শেয়ার করুন" : "Share this result"}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.4rem" }}>
                      {SHARE_TARGETS.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          role="menuitem"
                          onClick={() => shareTo(t.key as any)}
                          title={t.label}
                          aria-label={t.label}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                            padding: "0.55rem 0.25rem", borderRadius: 10, cursor: "pointer",
                            border: "none", background: "transparent", color: "var(--text-color, #1f2937)",
                            fontSize: "0.66rem",
                          }}
                        >
                          <span style={{
                            width: 40, height: 40, borderRadius: "50%", background: t.bg,
                            display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff",
                          }}>
                            {t.icon}
                          </span>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => shareTo("copy")}
                      style={{
                        marginTop: "0.6rem", width: "100%", display: "inline-flex",
                        alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "0.55rem 0.75rem", borderRadius: 10, cursor: "pointer",
                        border: "1px solid rgba(0,0,0,0.12)", background: "transparent",
                        color: "var(--text-color, #1f2937)", fontWeight: 600, fontSize: "0.82rem",
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} width="16" height="16">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                      </svg>
                      {shareState === "copied"
                        ? (language === "Bangla" ? "কপি হয়েছে!" : "Copied!")
                        : (language === "Bangla" ? "লিংক কপি করুন" : "Copy link")}
                    </button>

                    {typeof navigator !== "undefined" && (navigator as any).share && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => shareTo("native")}
                        style={{
                          marginTop: "0.4rem", width: "100%", display: "inline-flex",
                          alignItems: "center", justifyContent: "center", gap: 8,
                          padding: "0.55rem 0.75rem", borderRadius: 10, cursor: "pointer",
                          border: "1px solid rgba(0,0,0,0.12)", background: "transparent",
                          color: "var(--text-color, #1f2937)", fontWeight: 600, fontSize: "0.82rem",
                        }}
                      >
                        {language === "Bangla" ? "আরও বিকল্প…" : "More options…"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {result && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
              <button type="button" className="secondary-button" onClick={handleCheckAnother}>
                {language === "Bangla" ? "আরেকটি দাবি যাচাই করুন" : "Check another claim"}
              </button>
            </div>
          )}
        </section>
      </main>

      <Footer />

      {/* MODALS */}
      <Modal isOpen={showAbout} onClose={() => setShowAbout(false)} title={language === "Bangla" ? "আমাদের সম্পর্কে" : "About Us"} language={language}>
        <p>
          {language === "Bangla"
            ? "আমাদের এর লক্ষ্য হলো বিশ্বজুড়ে মুসলিম সম্প্রদায়ের জন্য কুরআন ও সহীহ হাদিস ভিত্তিক সঠিক তথ্য বিনামূল্যে পৌঁছে দেওয়া। আমরা বিশ্বাস করি দ্বীনি জ্ঞান সবার জন্য উন্মুক্ত এবং সহজলভ্য হওয়া উচিত।"
            : "Our mission is to provide the global Muslim community with free, accessible, and authentic information based strictly on the Quran and Sahih Hadith. We believe authentic Islamic knowledge should be available to everyone without barriers."}
        </p>
        <p>
          {language === "Bangla"
            ? "এটি একটি অলাভজনক উদ্যোগ যা দান এবং স্পন্সরশিপের মাধ্যমে পরিচালিত হয়।"
            : "This is a non-profit initiative powered by donations and community support."}
        </p>
      </Modal>

      <Modal isOpen={showMethodology} onClose={() => setShowMethodology(false)} title={language === "Bangla" ? "যাচাই পদ্ধতি" : "How We Verify"} language={language}>
        <p>
          {language === "Bangla"
            ? "আমাদের সিস্টেমটি দুই-ধাপের কাজ করে থাকে:"
            : "Our system follows a strict two-step verification process:"}
        </p>
        <ul>
          <li>
            <strong>{language === "Bangla" ? "১. উৎস সীমাবদ্ধতা" : "1. Source Restriction"}:</strong>
            {language === "Bangla"
              ? " আমরা শুধুমাত্র কুরআন এবং সহীহ হাদিস গ্রন্থ (বুখারী, মুসলিম ইত্যাদি) থেকে তথ্য গ্রহণ করি। উইকিপিডিয়া বা ইউটিউব গ্রহণযোগ্য নয়।"
              : " We strictly allow references ONLY from the Quran and established Hadith collections (Bukhari, Muslim, etc.). Wikipedia, YouTube, or general articles are rejected."}
          </li>
          <li>
            <strong>{language === "Bangla" ? "২. সরাসরি উৎস অনুসন্ধান" : "2. Direct Source Search"}:</strong>
            {language === "Bangla"
              ? " প্রতিটি দাবি সরাসরি নির্ভরযোগ্য ইসলামিক ডাটাবেসে (Kalimat) সিমান্টিক সার্চের মাধ্যমে খোঁজা হয়, এবং AI শুধুমাত্র প্রাপ্ত প্রকৃত উৎসের ভিত্তিতে রায় দেয় — কোনো তথ্য তৈরি করে না।"
              : " Every claim is searched directly in authentic Islamic databases (Kalimat) using semantic search, and the AI gives a verdict based ONLY on the real sources found — it never invents references."}
          </li>
        </ul>
        <p>
          {language === "Bangla"
            ? "যদি কোনো তথ্যের সরাসরি প্রমাণ হাদিস বা কুরআনে না পাওয়া যায়, তবে আমরা তা 'অনিশ্চিত' হিসেবে চিহ্নিত করি।"
            : "If a direct reference is not found in the scripture, we classify the claim as 'Uncertain' rather than guessing."}
        </p>
      </Modal>

      <Modal isOpen={showHowToUse} onClose={() => setShowHowToUse(false)} title={language === "Bangla" ? "ব্যবহারবিধি" : "How to Use"} language={language}>
        <p>
          {language === "Bangla"
            ? "এই টুলটি একটি সাধারণ সার্চ ইঞ্জিন নয়, এটি একটি 'সত্যতা যাচাইকরণ' ব্যবস্থা। ভালো ফলাফল পেতে আপনার প্রশ্নটি স্পষ্ট এবং পূর্ণাঙ্গ হতে হবে।"
            : "This tool is a 'Verification System', not a general search engine. To get the best results, you must ask full, specific questions to be verified."}
        </p>

        <div style={{ marginTop: '1.5rem' }}>
          <h4 style={{ marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
            {language === "Bangla" ? "ভালো প্রশ্নের উদাহরণ" : "Examples of Good vs Bad Queries"}
          </h4>

          <div className="example-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="example-bad" style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
              <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.5rem' }}>
                ✕ {language === "Bangla" ? "ভুল পদ্ধতি (অস্পষ্ট)" : "Bad (Too Vague)"}
              </strong>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#7f1d1d' }}>
                <li>{language === "Bangla" ? "নামাজ" : "Salah"}</li>
                <li>{language === "Bangla" ? "ঘোড়ার মাংস" : "Horse meat"}</li>
                <li>{language === "Bangla" ? "সুদ" : "Interest"}</li>
              </ul>
            </div>

            <div className="example-good" style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <strong style={{ color: '#059669', display: 'block', marginBottom: '0.5rem' }}>
                ✓ {language === "Bangla" ? "সঠিক পদ্ধতি (পূর্ণাঙ্গ)" : "Good (Verifiable)"}
              </strong>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#064e3b' }}>
                <li>{language === "Bangla" ? "নামাজে সূরা ফাতিহা পড়া কি বাধ্যতামূলক?" : "Is reciting Surah Fatiha mandatory in Salah?"}</li>
                <li>{language === "Bangla" ? "ঘোড়ার মাংস খাওয়া কি হালাল?" : "Is it permissible to eat horse meat?"}</li>
                <li>{language === "Bangla" ? "ব্যবসায়িক লোন এর উপর সুদ কি হারাম?" : "Is interest on business loans haram?"}</li>
              </ul>
            </div>
          </div>
        </div>

        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#6b7280', fontStyle: 'italic' }}>
          {language === "Bangla"
            ? "টিপস: আপনি যত স্পষ্টভাবে 'কি', 'কেন', 'কিভাবে' বা 'সত্য কি না' জিজ্ঞেস করবেন, এআই তত নিখুঁতভাবে হাদিস খুঁজে বের করতে পারবে।"
            : "Tip: The more specific you are (asking 'Is it true that...', 'Is it halal to...'), the accurately this app can dig into the texts."}
        </p>
      </Modal>

    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
const shareMatch = window.location.pathname.match(/^\/share\/([^/?#]+)/);
root.render(shareMatch ? <SharePage id={decodeURIComponent(shareMatch[1])} /> : <App />);

// Register the service worker so the app is installable and works offline.
// Best-effort: a failure here never affects the running app.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
