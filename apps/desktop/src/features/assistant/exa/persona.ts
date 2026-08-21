/**
 * When the agent's questionnaire asks who the user is, the answer should SET
 * the persona — not just inform the model once. Pure keyword mapping from the
 * answer to the panel's persona ids; null when the question isn't about the
 * user's role or the answer doesn't match a persona.
 */
export function personaFromAnswers(
  questions: { question: string }[],
  answers: string[][],
): string | null {
  // Strictly about the USER's own role — audience questions ("who is this
  // report for?") must not flip the persona.
  const roleQ = /\b(your role|role|persona)\b|describes? you/i;
  const audienceQ = /\b(audience|recipients?|targets?|readers?|for whom)\b|for\s*\?\s*$/i;
  const negated = /\bnot?\b|n't|\bexcept\b|\bnon-/i;
  const match = (answer: string): string | null => {
    if (/data scientist|\bml\b|machine learning/.test(answer)) return "data-scientist";
    if (/\bbi\b|business intelligence|dashboard/.test(answer)) return "bi-analyst";
    if (/\bfinanc/.test(answer)) return "finance-analyst";
    if (/\bdba\b|database admin/.test(answer)) return "dba";
    if (/executive|manager|\blead\b|cxo|c-level/.test(answer)) return "executive";
    if (/developer|engineer|programmer/.test(answer)) return "data-engineer";
    if (/analyst/.test(answer)) return "data-analyst";
    return null;
  };
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]?.question ?? "";
    if (!roleQ.test(question) || audienceQ.test(question)) continue;
    // First-picked answer wins on multi-select ("Developer, sometimes DBA");
    // negated custom text ("not a developer") sets nothing.
    for (const a of answers[i] ?? []) {
      if (negated.test(a)) continue;
      const persona = match(a.toLowerCase());
      if (persona) return persona;
    }
  }
  return null;
}
