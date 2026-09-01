// Personalization for the assistant — pure load/save/directive logic shared
// by the chat panel (reads at send time) and the Settings AI tab (writes).
// Persona keeps its existing key ("exa.persona") so the picker, the
// questionnaire auto-set, and Settings all stay one source of truth.

export type AiStyle = {
  depth: "concise" | "balanced" | "deep";
  output: "tables" | "charts" | "sql" | "prose";
  tone: "professional" | "friendly" | "direct";
  emoji: "never" | "sparing";
  custom: string;
};

export const AI_STYLE_DEFAULTS: AiStyle = {
  depth: "balanced",
  output: "tables",
  tone: "professional",
  emoji: "never",
  custom: "",
};

const STYLE_KEY = "exa.aiStyle";
const CUSTOM_MAX = 600;

export function parseAiStyle(raw: string | null): AiStyle {
  if (!raw) return { ...AI_STYLE_DEFAULTS };
  try {
    const v = JSON.parse(raw) as Partial<AiStyle>;
    return {
      depth: v.depth === "concise" || v.depth === "deep" ? v.depth : "balanced",
      output: v.output === "charts" || v.output === "sql" || v.output === "prose" ? v.output : "tables",
      tone: v.tone === "friendly" || v.tone === "direct" ? v.tone : "professional",
      emoji: v.emoji === "sparing" ? "sparing" : "never",
      custom: typeof v.custom === "string" ? v.custom.slice(0, CUSTOM_MAX) : "",
    };
  } catch {
    return { ...AI_STYLE_DEFAULTS };
  }
}

export function loadAiStyle(): AiStyle {
  try {
    return parseAiStyle(localStorage.getItem(STYLE_KEY));
  } catch {
    return { ...AI_STYLE_DEFAULTS };
  }
}

export function saveAiStyle(patch: Partial<AiStyle>): AiStyle {
  const next = { ...loadAiStyle(), ...patch };
  next.custom = (next.custom ?? "").slice(0, CUSTOM_MAX);
  try {
    localStorage.setItem(STYLE_KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent("exa:style-changed"));
  return next;
}

const DEPTH_TEXT: Record<AiStyle["depth"], string> = {
  concise: "Answer with just the result — minimal explanation unless asked.",
  balanced: "Answer with balanced technical depth: the result first, then a short explanation.",
  deep: "Answer in depth: explain the reasoning, trade-offs, and internals behind the result.",
};
const OUTPUT_TEXT: Record<AiStyle["output"], string> = {
  tables: "Prefer tables when presenting data.",
  charts: "Prefer charts and dashboards when presenting data (use your dashboard/artifact tools).",
  sql: "Lead with the SQL; show the statement before its results.",
  prose: "Prefer clear prose; use tables only when structure demands it.",
};
const TONE_TEXT: Record<AiStyle["tone"], string> = {
  professional: "Keep a professional, matter-of-fact tone.",
  friendly: "Keep a warm, approachable tone.",
  direct: "Be maximally direct — no pleasantries, no filler.",
};

/** One directive sentence block for the per-message machine context. */
export function styleDirective(persona: string | null | undefined, style: AiStyle): string {
  const parts = [
    persona
      ? `The user's persona is ${persona}: execute each request at the discipline it needs, but present the answer at that persona's depth and preferred format.`
      : "",
    DEPTH_TEXT[style.depth],
    OUTPUT_TEXT[style.output],
    TONE_TEXT[style.tone],
    style.emoji === "never" ? "Never use emoji." : "Emoji are fine, used sparingly.",
    style.custom.trim() ? `Additional standing instructions from the user: ${style.custom.trim()}` : "",
  ];
  return parts.filter(Boolean).join(" ");
}
