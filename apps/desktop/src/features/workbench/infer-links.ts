import type { GraphLink, GraphTable } from "@/lib/ipc";

/**
 * Relationship inference for schemas without declared foreign keys — scored,
 * type-gated, and honest about ambiguity. Replaces "a column with exactly the
 * parent's PK name is a foreign key", which missed CUSTOMER_ID → CUSTOMERS.ID
 * and happily linked every table's ID to every other table's ID.
 */
export type InferredLink = GraphLink & {
  /** 0..1 — how much to trust this edge. */
  score: number;
  reason: "same key name" | "naming convention" | "normalised name";
  /** The child column matched more than one parent; both are shown weak. */
  ambiguous: boolean;
};

const GENERIC = new Set(["ID", "KEY", "CODE", "NAME", "NO", "NUM", "NUMBER", "PK", "UID", "GUID"]);

type Family = "number" | "text" | "other";
export function typeFamily(dataType: string): Family {
  const t = dataType.toUpperCase();
  if (/^(DECIMAL|NUMERIC|NUMBER|INT|INTEGER|BIGINT|SMALLINT|TINYINT|DOUBLE|FLOAT|REAL)/.test(t)) return "number";
  if (/^(VARCHAR|CHAR|NVARCHAR|NCHAR|TEXT|STRING|HASHTYPE)/.test(t)) return "text";
  return "other";
}

/** ORDERS → ORDER, CITIES → CITY, ADDRESSES → ADDRESS, BOXES → BOX; STATUS stays. */
export function singular(name: string): string {
  const n = name.toUpperCase();
  if (n.endsWith("IES") && n.length > 4) return `${n.slice(0, -3)}Y`;
  if (/(SSES|XES|CHES|SHES|ZES)$/.test(n)) return n.slice(0, -2);
  if (n.endsWith("SS") || n.endsWith("US") || n.endsWith("IS")) return n;
  if (n.endsWith("S") && n.length > 2) return n.slice(0, -1);
  return n;
}

/** Strip the decoration people hang on key columns, then compare loosely. */
export function normaliseKey(name: string): string {
  let n = name.toUpperCase().replace(/^(FK|REF)_/, "").replace(/_(FK|KEY|NO|NUM|NUMBER|REF)$/, "");
  // TPC-H style single-letter table prefixes: O_CUSTKEY / C_CUSTKEY.
  const m = /^[A-Z]{1,2}_(.{4,})$/.exec(n);
  if (m) n = m[1];
  return n.replace(/_/g, "");
}

function conventionNames(parent: string): Set<string> {
  const p = parent.toUpperCase().replace(/_/g, "");
  const s = singular(parent).replace(/_/g, "");
  return new Set([`${p}ID`, `${s}ID`, `${p}KEY`, `${s}KEY`]);
}

type IdTable = GraphTable & { id?: string };
const idOf = (t: IdTable) => t.id ?? t.name;

/** A child column prepared once: every spelling a rule compares against. */
type ColRef = {
  table: string;
  col: string;
  family: Family;
  upper: string;
  flat: string;
  norm: string;
  /** The child's own sole primary key is a parent key, not a reference. */
  soleKey: boolean;
};

const push = (m: Map<string, ColRef[]>, key: string, ref: ColRef) => {
  const list = m.get(key);
  if (list) list.push(ref);
  else m.set(key, [ref]);
};

export function inferLinks(
  tables: IdTable[],
  declared: GraphLink[],
  options: { minScore?: number } = {},
): InferredLink[] {
  const minScore = options.minScore ?? 0.6;
  const declaredPairs = new Set(declared.map((l) => `${l.source}.${l.sourceColumn}>${l.target}.${l.targetColumn}`.toUpperCase()));

  // Index every column once by the three spellings the rules match on, keyed
  // with its type family — the work is then linear in columns, not in
  // parents × children × columns (a 1,000-table schema took seconds).
  //
  // Each table is scored on its OWN columns, so table ids must be unique —
  // they are (`SCHEMA.TABLE`, built in connection-graph.ts). Two tables
  // sharing an id would each contribute their own candidates rather than one
  // shadowing the other.
  const byUpper = new Map<string, ColRef[]>();
  const byFlat = new Map<string, ColRef[]>();
  const byNorm = new Map<string, ColRef[]>();
  for (const t of tables) {
    const pks = t.columns.filter((c) => c.pk);
    for (const c of t.columns) {
      const family = typeFamily(c.dataType);
      if (family === "other") continue;
      const upper = c.name.toUpperCase();
      const ref: ColRef = {
        table: idOf(t),
        col: c.name,
        family,
        upper,
        flat: upper.replace(/_/g, ""),
        norm: normaliseKey(c.name),
        soleKey: pks.length === 1 && pks[0].name === c.name,
      };
      push(byUpper, `${family}|${ref.upper}`, ref);
      push(byFlat, `${family}|${ref.flat}`, ref);
      push(byNorm, `${family}|${ref.norm}`, ref);
    }
  }

  const candidates: InferredLink[] = [];
  for (const parent of tables) {
    const parentId = idOf(parent);
    const pks = parent.columns.filter((c) => c.pk);
    if (pks.length === 0) continue;
    const composite = pks.length > 1 ? 0.8 : 1;
    const conv = conventionNames(parent.name);
    for (const pk of pks) {
      const pkUpper = pk.name.toUpperCase();
      const pkFamily = typeFamily(pk.dataType);
      if (pkFamily === "other") continue;
      const pkNorm = normaliseKey(pk.name);
      // The first rule that fires for a column wins, in this order.
      const matched = new Map<ColRef, { score: number; reason: InferredLink["reason"] }>();
      const consider = (refs: ColRef[] | undefined, score: number, reason: InferredLink["reason"]) => {
        for (const ref of refs ?? []) {
          if (ref.table === parentId || ref.soleKey || matched.has(ref)) continue;
          matched.set(ref, { score, reason });
        }
      };
      if (!GENERIC.has(pkUpper)) consider(byUpper.get(`${pkFamily}|${pkUpper}`), 1, "same key name");
      if (GENERIC.has(pkUpper) || conv.has(pkUpper.replace(/_/g, ""))) {
        for (const name of conv) consider(byFlat.get(`${pkFamily}|${name}`), 0.9, "naming convention");
      }
      if (!GENERIC.has(pkNorm)) consider(byNorm.get(`${pkFamily}|${pkNorm}`), 0.7, "normalised name");
      for (const [ref, { score, reason }] of matched) {
        const key = `${ref.table}.${ref.col}>${parentId}.${pk.name}`.toUpperCase();
        if (declaredPairs.has(key)) continue;
        candidates.push({ source: ref.table, sourceColumn: ref.col, target: parentId, targetColumn: pk.name, score: score * composite, reason, ambiguous: false });
      }
    }
  }

  // One child column pointing at two different parents: neither is sure.
  const byChildCol = new Map<string, InferredLink[]>();
  for (const c of candidates) {
    const k = `${c.source}.${c.sourceColumn}`;
    byChildCol.set(k, [...(byChildCol.get(k) ?? []), c]);
  }
  for (const group of byChildCol.values()) {
    if (new Set(group.map((g) => g.target)).size > 1) {
      for (const g of group) {
        g.score = Math.round(g.score * 0.5 * 100) / 100;
        g.ambiguous = true;
      }
    }
  }
  return candidates
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source) || a.sourceColumn.localeCompare(b.sourceColumn));
}
