
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { socialConfig } from "./socialConfig";

// --- CONSTANTS ---
const MIN_LEN = 10;
const MAX_LEN = 500;

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

// --- COMPONENTS ---

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, language }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
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
            {result.cached && <span style={{ fontSize: '0.6rem', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px', opacity: 0.7 }}>(Cached)</span>}
          </div>
          <p className="verdict-explanation">{result.explanation}</p>
        </div>
      </div>

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
        <div className="header-logo-container"><SahihLogo /></div>
        <div className="header-title-container"><h1 className="title">Is It Sahih</h1></div>
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
              📎 {language === "Bangla" ? "শেয়ারকৃত ফলাফল" : "Shared result"}
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
  const [language, setLanguage] = useState("English");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [shareState, setShareState] = useState("idle"); // idle|saving|ready|copied|error
  const [shareUrl, setShareUrl] = useState("");

  // Loading Messages Configuration
  const loadingMessages = {
    English: [
      "Analyzing your question...",
      "Searching authentic Hadith collections...",
      "Cross-referencing with Quranic verses...",
      "Checking authentic sources...",
      "Consulting Islamic databases...",
      "Generating final verdict..."
    ],
    Bangla: [
      "আপনার প্রশ্নটি বিশ্লেষণ করা হচ্ছে...",
      "সহীহ হাদিস গ্রন্থগুলো অনুসন্ধান করা হচ্ছে...",
      "কুরআনের সাথে তুলনা করা হচ্ছে...",
      "নির্ভরযোগ্য উৎস যাচাই করা হচ্ছে...",
      "ইসলামিক ডেটাবেস চেক করা হচ্ছে...",
      "ফলাফল প্রস্তুত করা হচ্ছে..."
    ]
  };

  // Modal States
  const [showAbout, setShowAbout] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const languages = ["English", "Bangla"];

  const genericError =
    language === "Bangla"
      ? "দুঃখিত, এই মুহূর্তে যাচাই করা সম্ভব হয়নি। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।"
      : "Sorry, we couldn't verify this right now. Please try again in a moment.";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Message Rotation Effect
  useEffect(() => {
    let interval: any;
    if (loading) {
      const messages = language === "Bangla" ? loadingMessages.Bangla : loadingMessages.English;
      let i = 0;
      setLoadingMessage(messages[0]);
      interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setLoadingMessage(messages[i]);
      }, 3000); // Change message every 3 seconds
    } else {
      setLoadingMessage("");
    }
    return () => clearInterval(interval);
  }, [loading, language]);

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
      {/* Grid Item 1: Logo on the far left */}
      <div className="header-logo-container">
        {/* Use SVG component instead of img tag to ensure display even without file */}
        <SahihLogo />
      </div>

      {/* Grid Item 2: Title in the exact center */}
      <div className="header-title-container">
        <h1 className="title">Is It Sahih</h1>
      </div>

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
  const doShare = async () => {
    if (!result) return;
    // Already have a link for this result — just re-share/copy it.
    if (shareUrl) {
      copyOrNativeShare(shareUrl);
      return;
    }
    setShareState("saving");
    try {
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
      setShareState("ready");
      copyOrNativeShare(data.shareUrl);
    } catch {
      setShareState("error");
    }
  };

  const copyOrNativeShare = (url: string) => {
    const nav: any = navigator;
    if (nav.share) {
      nav.share({ title: "IsItSahih", text: "Verification result", url }).catch(() => {});
    } else if (nav.clipboard) {
      nav.clipboard.writeText(url).then(() => {
        setShareState("copied");
        setTimeout(() => setShareState("ready"), 2000);
      }).catch(() => {});
    }
  };

  const shareLabel = () => {
    if (shareState === "saving") return language === "Bangla" ? "লিংক তৈরি হচ্ছে..." : "Generating link...";
    if (shareState === "copied") return language === "Bangla" ? "কপি হয়েছে!" : "Copied!";
    if (shareState === "error") return language === "Bangla" ? "আবার চেষ্টা করুন" : "Try again";
    if (shareUrl) return language === "Bangla" ? "লিংক কপি করুন" : "Copy link";
    return language === "Bangla" ? "ফলাফল শেয়ার করুন" : "Share Result";
  };

  const trimmedLen = claim.trim().length;
  const lengthValid = trimmedLen >= MIN_LEN && trimmedLen <= MAX_LEN;
  const counterColor = claim.length > MAX_LEN ? "#ef4444" : "#9ca3af";

  return (
    <div className="container">
      <Header />
      <main role="main" aria-label="Islamic Verification Tool">
        {/* SEO Content - Screen Reader Only */}
        <h1 className="sr-only">Verify Islamic Claims with Quran and Sahih Hadith</h1>
        <div className="sr-only" role="contentinfo">
          IsItSahih verifies Islamic statements strictly against the Quran and authentic Sahih Hadith collections.
          This educational tool provides references from trusted Islamic sources.
          Not intended as religious legal advice or fatwa. Consult qualified Islamic scholars for personal rulings.
        </div>

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
            <button
              type="submit"
              className="submit-button"
              disabled={loading || !lengthValid}
            >
              {loading ? (
                <div className="loading-container">
                  <div className="spinner"></div>
                  <span className="loading-text">{loadingMessage}</span>
                </div>
              ) : (language === "Bangla" ? "সত্যতা যাচাই করুন" : "Check Authenticity")}
            </button>
          </form>
          {error && <div className="error-message">{error}</div>}
          {result && <ResultView result={result} language={language} />}
          {result && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "1.25rem" }}>
              <button
                type="button"
                className="share-button"
                onClick={doShare}
                disabled={shareState === "saving"}
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
                {shareLabel()}
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
                ❌ {language === "Bangla" ? "ভুল পদ্ধতি (অস্পষ্ট)" : "Bad (Too Vague)"}
              </strong>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.9rem', color: '#7f1d1d' }}>
                <li>{language === "Bangla" ? "নামাজ" : "Salah"}</li>
                <li>{language === "Bangla" ? "ঘোড়ার মাংস" : "Horse meat"}</li>
                <li>{language === "Bangla" ? "সুদ" : "Interest"}</li>
              </ul>
            </div>

            <div className="example-good" style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <strong style={{ color: '#059669', display: 'block', marginBottom: '0.5rem' }}>
                ✅ {language === "Bangla" ? "সঠিক পদ্ধতি (পূর্ণাঙ্গ)" : "Good (Verifiable)"}
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
