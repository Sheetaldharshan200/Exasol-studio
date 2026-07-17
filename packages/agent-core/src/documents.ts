import { randomUUID } from "node:crypto";

/**
 * Session-scoped uploaded documents with just-in-time retrieval. We never
 * dump a whole file into the prompt: files are split into semantic chunks
 * with metadata, and the agent searches/reads specific sections through
 * tools. KISS — in-memory, lives with the working session.
 */

export type DocChunk = {
  docId: string;
  docName: string;
  index: number;
  heading: string | null;
  text: string;
};

export type DocMeta = {
  id: string;
  name: string;
  mime: string;
  chunks: number;
  chars: number;
  /** True for binary files (e.g. Parquet) stored as base64 for loading only. */
  binary?: boolean;
};

const MAX_CHUNK = 1500;

/** Split into semantic chunks: by markdown headings, then by paragraphs. */
function chunk(text: string): { heading: string | null; text: string }[] {
  const out: { heading: string | null; text: string }[] = [];
  // Break on markdown headings so each section keeps its title as metadata.
  const sections = text.split(/\n(?=#{1,6}\s)/);
  for (const section of sections) {
    const headingMatch = section.match(/^#{1,6}\s+(.+)/);
    const heading = headingMatch ? headingMatch[1].trim() : null;
    const body = section.trim();
    if (!body) continue;
    if (body.length <= MAX_CHUNK) {
      out.push({ heading, text: body });
      continue;
    }
    // Long section → pack paragraphs up to the chunk budget.
    let buf = "";
    for (const para of body.split(/\n\s*\n/)) {
      if (buf.length + para.length > MAX_CHUNK && buf) {
        out.push({ heading, text: buf.trim() });
        buf = "";
      }
      buf += (buf ? "\n\n" : "") + para;
    }
    if (buf.trim()) out.push({ heading, text: buf.trim() });
  }
  return out;
}

export class DocumentStore {
  private bySession = new Map<string, { meta: DocMeta; chunks: DocChunk[]; raw: string; binary: boolean }[]>();

  add(sessionId: string, name: string, mime: string, text: string): DocMeta {
    const id = randomUUID().slice(0, 8);
    const pieces = chunk(text);
    const chunks: DocChunk[] = pieces.map((p, i) => ({
      docId: id,
      docName: name,
      index: i,
      heading: p.heading,
      text: p.text,
    }));
    const meta: DocMeta = { id, name, mime, chunks: chunks.length, chars: text.length };
    const list = this.bySession.get(sessionId) ?? [];
    // Keep the untouched original too — chunking is lossy (trims blank lines),
    // and structured loaders (CSV import) need the file exactly as uploaded.
    list.push({ meta, chunks, raw: text, binary: false });
    this.bySession.set(sessionId, list);
    return meta;
  }

  /** Store a binary file (base64) — not chunked/searchable, only loadable. */
  addBinary(sessionId: string, name: string, mime: string, base64: string): DocMeta {
    const id = randomUUID().slice(0, 8);
    const meta: DocMeta = { id, name, mime, chunks: 0, chars: base64.length, binary: true };
    const list = this.bySession.get(sessionId) ?? [];
    list.push({ meta, chunks: [], raw: base64, binary: true });
    this.bySession.set(sessionId, list);
    return meta;
  }

  list(sessionId: string): DocMeta[] {
    return (this.bySession.get(sessionId) ?? []).map((d) => d.meta);
  }

  /** The original file payload — text for CSV, base64 for binary (Parquet). */
  raw(sessionId: string, docId: string): { name: string; mime: string; text: string; binary: boolean } | undefined {
    const doc = (this.bySession.get(sessionId) ?? []).find((d) => d.meta.id === docId);
    return doc ? { name: doc.meta.name, mime: doc.meta.mime, text: doc.raw, binary: doc.binary } : undefined;
  }

  /** Keyword-overlap search across all chunks in the session. */
  search(sessionId: string, query: string, limit = 5): DocChunk[] {
    const docs = this.bySession.get(sessionId) ?? [];
    const terms = [...new Set(query.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length > 2))];
    if (!terms.length) return [];
    const scored = docs
      .flatMap((d) => d.chunks)
      .map((c) => {
        // The file NAME is part of the haystack — models search for
        // "customers.csv" and must find the file's own chunks.
        const hay = `${c.docName} ${c.heading ?? ""} ${c.text}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          const hits = hay.split(t).length - 1;
          score += hits;
        }
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return scored.map((x) => x.c);
  }

  read(sessionId: string, docId: string, section?: number): DocChunk[] {
    const docs = this.bySession.get(sessionId) ?? [];
    const doc = docs.find((d) => d.meta.id === docId);
    if (!doc) return [];
    if (typeof section === "number") return doc.chunks.filter((c) => c.index === section);
    return doc.chunks;
  }
}
