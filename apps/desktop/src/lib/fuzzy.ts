// VS Code-style fuzzy matching: subsequence match with quality scoring —
// word-boundary and camelCase hits score high, consecutive runs compound,
// gaps and late starts cost. Pure and tested; every search surface uses it.

export type FuzzyMatch = { score: number; positions: number[] };

const BOUNDARY = /[\s\-_./:@(]/;

function isBoundaryStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (BOUNDARY.test(prev)) return true;
  // camelCase / PascalCase boundary
  return prev === prev.toLowerCase() && text[i] === text[i].toUpperCase() && /[a-zA-Z]/.test(text[i]);
}

/** Score `query` against `text`. Null = not a subsequence match. */
export function fuzzyScore(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  if (q.length > t.length) return null;

  // Exact/substring fast paths dominate everything else.
  const sub = t.indexOf(q);
  if (sub >= 0) {
    const positions = Array.from({ length: q.length }, (_, k) => sub + k);
    const startBonus = isBoundaryStart(text, sub) ? 40 : 0;
    return { score: 200 + startBonus - Math.min(sub, 40) + Math.max(0, 20 - (t.length - q.length)), positions };
  }

  // Greedy-with-boundary-preference subsequence walk.
  const positions: number[] = [];
  let score = 0;
  let ti = 0;
  let lastHit = -2;
  for (let qi = 0; qi < q.length; qi++) {
    let found = -1;
    // Prefer the next boundary-start occurrence within a lookahead window.
    for (let i = ti; i < t.length; i++) {
      if (t[i] !== q[qi]) continue;
      if (found < 0) found = i;
      if (isBoundaryStart(text, i)) {
        found = i;
        break;
      }
      if (i - ti > 24) break; // bounded lookahead
    }
    if (found < 0) return null;
    if (isBoundaryStart(text, found)) score += 30;
    if (found === lastHit + 1) score += 15; // consecutive run
    score -= Math.min(found - ti, 10); // gap penalty
    positions.push(found);
    lastHit = found;
    ti = found + 1;
  }
  score -= Math.floor(positions[0] / 4); // late-start penalty
  score += Math.max(0, 10 - (t.length - q.length) / 4); // shortness bonus
  return { score, positions };
}

/** Rank a list by fuzzy relevance; non-matches drop out. */
export function fuzzyRank<T>(query: string, items: T[], textOf: (item: T) => string): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyScore(query, textOf(item));
    if (match) out.push({ item, match });
  }
  return out.sort((a, b) => b.match.score - a.match.score);
}
