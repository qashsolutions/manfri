// Deterministic résumé parsing — ported from services/api/app/parsing/{extract,resume}.py
// (EXTRACTION_REPORT §3). Bytes → text (PDF/DOCX/text) → reproducible non-PII parsed_jsonb
// (skills, experience estimate, link domains, contact-presence booleans, text length).
// No network/LLM. PDF/DOCX extractors are loaded lazily; a corrupt binary degrades to
// empty text rather than throwing.

import { findSkills, SKILL_DICTIONARY_VERSION } from "@/lib/domain/skills";

export const PARSER_MODEL_ID = "deterministic-resume-parser@1";
export const PARSER_PROMPT_VERSION = "rules/resume@1";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?<!\d)(?:\+?\d[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/;
const URL_RE = /https?:\/\/([A-Za-z0-9.-]+)/gi;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const EXPLICIT_YEARS_RE = /(\d{1,2})\+?\s*years?\b/gi;
const RANGE_RE = /\b((?:19|20)\d{2})\s*(?:-|–|—|to|until|through)\s*((?:19|20)\d{2}|present|current)\b/gi;

const PDF_TYPES = new Set(["application/pdf"]);
const DOCX_TYPES = new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

export interface DateRange {
  start: number;
  end: number | null; // null = open-ended ("present"/"current")
}

export interface ParsedResume {
  skills: string[];
  total_experience_years: number | null;
  date_ranges: DateRange[];
  has_email: boolean;
  has_phone: boolean;
  link_domains: string[];
  text_chars: number;
  extraction_method: string;
}

export function toJsonb(p: ParsedResume): Record<string, unknown> {
  return {
    parser_version: PARSER_MODEL_ID,
    skills_lexicon: SKILL_DICTIONARY_VERSION,
    skills: p.skills,
    total_experience_years: p.total_experience_years,
    date_ranges: p.date_ranges,
    link_domains: p.link_domains,
    contact: { has_email: p.has_email, has_phone: p.has_phone },
    stats: { text_chars: p.text_chars },
    extraction_method: p.extraction_method,
  };
}

// Dated employment ranges (years only — non-PII), for the timeline authenticity check.
function extractRanges(text: string): DateRange[] {
  const ranges: DateRange[] = [];
  for (const m of text.matchAll(RANGE_RE)) {
    const start = Number.parseInt(m[1] ?? "0", 10);
    const tok = (m[2] ?? "").toLowerCase();
    const end = tok === "present" || tok === "current" ? null : Number.parseInt(tok, 10);
    if (end === null || end >= start) ranges.push({ start, end });
  }
  return ranges;
}

function linkDomains(text: string): string[] {
  const domains = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    let host = (m[1] ?? "").toLowerCase().replace(/^\.+|\.+$/g, "");
    if (host.startsWith("www.")) host = host.slice(4);
    if (host) domains.add(host);
  }
  return [...domains].sort();
}

// Estimate total years of experience deterministically (no wall-clock): combine explicit
// "N years" mentions with dated ranges; open-ended ranges anchor to the latest year in the
// document, so the estimate is reproducible. Returns the max signal or null.
function experienceYears(text: string): number | null {
  const years = [...text.matchAll(YEAR_RE)].map((m) => Number.parseInt(m[0], 10));
  const anchor = years.length ? Math.max(...years) : null;

  const candidates: number[] = [];
  for (const m of text.matchAll(EXPLICIT_YEARS_RE)) candidates.push(Number.parseInt(m[1] ?? "0", 10));
  for (const m of text.matchAll(RANGE_RE)) {
    const start = Number.parseInt(m[1] ?? "0", 10);
    const endTok = (m[2] ?? "").toLowerCase();
    let end: number;
    if (endTok === "present" || endTok === "current") {
      if (anchor === null) continue;
      end = anchor;
    } else {
      end = Number.parseInt(endTok, 10);
    }
    if (end >= start) candidates.push(end - start);
  }
  return candidates.length ? Math.max(...candidates) : null;
}

export function parseResumeText(text: string, extractionMethod = "text"): ParsedResume {
  return {
    skills: findSkills(text),
    total_experience_years: experienceYears(text),
    date_ranges: extractRanges(text),
    has_email: EMAIL_RE.test(text),
    has_phone: PHONE_RE.test(text),
    link_domains: linkDomains(text),
    text_chars: text.length,
    extraction_method: extractionMethod,
  };
}

export function chooseMethod(content: Uint8Array, contentType?: string | null, filename?: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  const name = (filename ?? "").toLowerCase();
  const magic = Buffer.from(content.slice(0, 5)).toString("latin1");
  if (PDF_TYPES.has(ct) || name.endsWith(".pdf") || magic === "%PDF-") return "pdf";
  if (DOCX_TYPES.has(ct) || name.endsWith(".docx")) return "docx";
  return "text";
}

async function extractText(
  content: Uint8Array,
  contentType?: string | null,
  filename?: string | null,
): Promise<{ text: string; method: string }> {
  const method = chooseMethod(content, contentType, filename);
  if (method === "pdf") {
    try {
      const { extractText: pdfExtract } = await import("unpdf");
      const { text } = await pdfExtract(content, { mergePages: true });
      return { text: Array.isArray(text) ? text.join("\n") : text, method };
    } catch {
      return { text: "", method }; // corrupt/encrypted PDF → no text, keep going
    }
  }
  if (method === "docx") {
    try {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(content) });
      return { text: value, method };
    } catch {
      return { text: "", method };
    }
  }
  return { text: Buffer.from(content).toString("utf8"), method };
}

export async function parseResumeBytes(
  content: Uint8Array,
  contentType?: string | null,
  filename?: string | null,
): Promise<ParsedResume> {
  const { text, method } = await extractText(content, contentType, filename);
  return parseResumeText(text, method);
}
