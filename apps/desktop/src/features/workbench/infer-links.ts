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

export function inferLinks(
  tables: GraphTable[],
  declared: GraphLink[],
  options: { minScore?: number } = {},
): InferredLink[] {
  const minScore = options.minScore ?? 0.6;
  const declaredPairs = new Set(declared.map((l) => `${l.source}.${l.sourceColumn}>${l.target}.${l.targetColumn}`.toUpperCase()));
  const pkOf = new Map(tables.map((t) => [t.name, t.columns.filter((c) => c.pk)]));

  const candidates: InferredLink[] = [];
  for (const parent of tables) {
    const pks = pkOf.get(parent.name) ?? [];
    if (pks.length === 0) continue;
    const composite = pks.length > 1 ? 0.8 : 1;
    const conv = conventionNames(parent.name);
    for (const pk of pks) {
      const pkUpper = pk.name.toUpperCase();
      const pkFamily = typeFamily(pk.dataType);
      if (pkFamily === "other") continue;
      const pkNorm = normaliseKey(pk.name);
      for (const child of tables) {
        if (child.name === parent.name) continue;
        const childPks = pkOf.get(child.name) ?? [];
        for (const col of child.columns) {
          if (typeFamily(col.dataType) !== pkFamily) continue;
          // The child's own sole primary key is a parent key, not a reference.
          if (childPks.length === 1 && childPks[0].name === col.name) continue;
          const colUpper = col.name.toUpperCase();
          const colFlat = colUpper.replace(/_/g, "");
          let score = 0;
          let reason: InferredLink["reason"] | null = null;
          if (colUpper === pkUpper && !GENERIC.has(pkUpper)) {
            score = 1;
            reason = "same key name";
          } else if (conv.has(colFlat) && (GENERIC.has(pkUpper) || conv.has(pkUpper.replace(/_/g, "")))) {
            score = 0.9;
            reason = "naming convention";
          } else if (normaliseKey(col.name) === pkNorm && !GENERIC.has(pkNorm)) {
            score = 0.7;
            reason = "normalised name";
          }
          if (!reason) continue;
          const key = `${child.name}.${col.name}>${parent.name}.${pk.name}`.toUpperCase();
          if (declaredPairs.has(key)) continue;
          candidates.push({ source: child.name, sourceColumn: col.name, target: parent.name, targetColumn: pk.name, score: score * composite, reason, ambiguous: false });
        }
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
