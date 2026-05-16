// src/lib/agents/brief-extractor/extract.ts
//
// Sprint 3G Phase 1a (2026-05-16) — core extractor function.
//
// Pipeline:
//   1. Validate URL (http/https, no private/local addresses for SSRF safety)
//   2. Fetch HTML with 10s timeout, polite User-Agent
//   3. Strip HTML to plain text (regex-based, no cheerio dependency)
//   4. Truncate to 20K chars (~5K tokens — well inside Haiku context)
//   5. Call Haiku 4.5 with cached system prompt
//   6. Validate output length (50-1000 chars) + sentinel check
//
// Future Phase 1b will wrap this in a Server Action for the
// /dashboard/settings page (button: "🪄 צור brief מהאתר").
// Future Phase 1c may add Google Business + Instagram public posts.

import "server-only";

import { anthropic } from "@/lib/anthropic";
import {
  BRIEF_EXTRACTOR_SYSTEM_PROMPT,
  buildBriefExtractorUserMessage,
} from "./prompt";

const MODEL = "claude-haiku-4-5-20251001" as const;
const MAX_HTML_CHARS = 20000;
const FETCH_TIMEOUT_MS = 10000;
const MIN_USEFUL_TEXT_CHARS = 50;
const MIN_BRIEF_LENGTH = 50;
const MAX_BRIEF_LENGTH = 1000;

export interface ExtractBriefResult {
  ok: boolean;
  brief?: string;
  error?: string;
  fetchedBytes?: number;
  cleanedTextChars?: number;
  durationMs?: number;
}

export async function extractBriefFromWebsite(
  websiteUrl: string
): Promise<ExtractBriefResult> {
  const startedAt = Date.now();

  // ── Validate URL ──
  let parsed: URL;
  try {
    parsed = new URL(websiteUrl);
  } catch {
    return { ok: false, error: "כתובת URL לא תקינה" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "רק http/https נתמכים" };
  }

  // SSRF protection — block local/private network addresses
  // (Caller cannot make the server fetch internal Vercel/Supabase endpoints)
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    return { ok: false, error: "כתובות פנימיות לא נתמכות" };
  }

  // ── Fetch HTML ──
  let html: string;
  let fetchedBytes: number;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "SpikeEngine-BriefExtractor/1.0 (+https://app.spikeai.co.il)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "he,en;q=0.9",
      },
      redirect: "follow",
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: `האתר החזיר שגיאה ${response.status} ${response.statusText || ""}`.trim(),
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return {
        ok: false,
        error: `האתר החזיר ${contentType || "unknown content-type"} — לא HTML`,
      };
    }

    html = await response.text();
    fetchedBytes = html.length;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("aborted")) {
      return { ok: false, error: "האתר לא הגיב תוך 10 שניות" };
    }
    return { ok: false, error: `שגיאה בטעינת האתר: ${message}` };
  }

  // ── Strip HTML to plain text + truncate ──
  const cleaned = htmlToPlainText(html);
  const cleanedTextChars = cleaned.length;

  if (cleanedTextChars < MIN_USEFUL_TEXT_CHARS) {
    return {
      ok: false,
      error: `האתר לא הכיל מספיק תוכן (${cleanedTextChars} תווים בלבד)`,
      fetchedBytes,
      cleanedTextChars,
    };
  }

  const truncated = cleaned.slice(0, MAX_HTML_CHARS);

  // ── Call Haiku 4.5 ──
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: BRIEF_EXTRACTOR_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildBriefExtractorUserMessage(websiteUrl, truncated),
        },
      ],
    });

    const briefText = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    const durationMs = Date.now() - startedAt;

    if (briefText === "_INSUFFICIENT_DATA_" || briefText.length === 0) {
      return {
        ok: false,
        error:
          "לא ניתן לחלץ brief מהאתר — תוכן לא מספיק או לא רלוונטי. מומלץ לכתוב ידנית.",
        fetchedBytes,
        cleanedTextChars,
        durationMs,
      };
    }

    // Sanity bounds
    if (briefText.length < MIN_BRIEF_LENGTH) {
      return {
        ok: false,
        error: `ה-brief שיוצר קצר מדי (${briefText.length} תווים)`,
        fetchedBytes,
        cleanedTextChars,
        durationMs,
      };
    }
    if (briefText.length > MAX_BRIEF_LENGTH) {
      // Don't fail — just truncate at sentence boundary if we can
      const truncatedBrief = briefText
        .slice(0, MAX_BRIEF_LENGTH)
        .replace(/[^.!?]+$/, "")
        .trim();
      return {
        ok: true,
        brief: truncatedBrief.length >= MIN_BRIEF_LENGTH
          ? truncatedBrief
          : briefText.slice(0, MAX_BRIEF_LENGTH),
        fetchedBytes,
        cleanedTextChars,
        durationMs,
      };
    }

    return {
      ok: true,
      brief: briefText,
      fetchedBytes,
      cleanedTextChars,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `שגיאת LLM: ${message}`,
      fetchedBytes,
      cleanedTextChars,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Strip HTML tags and reduce to plain text. No cheerio dependency.
 *
 * Removes scripts, styles, head, nav, footer (typically noise),
 * then strips all remaining tags and decodes common entities.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
