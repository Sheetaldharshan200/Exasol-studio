/** The diagram's own fuzzy scorer (substring wins, then subsequence runs). */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  let base = 0;
  if (direct >= 0) base = 1000 - direct * 5 + (direct === 0 ? 200 : 0); // substring wins
  let qi = 0;
  let score = 0;
  let last = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += ti === last + 1 ? 5 : 1;
      if (ti === 0) score += 3;
      last = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  return base + score;
}
