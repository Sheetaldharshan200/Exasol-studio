// The live label for the chat's work disclosure — what the agent is doing
// RIGHT NOW ("Thinking", "Querying the database", …) instead of a static
// "Working". Pure and tested; the component feeds it the active part.

export function toolGerund(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("sql") || n.includes("exasol") || n.includes("database") || n.includes("dashboard")) return "Querying the database";
  if (n === "bash" || n.includes("shell") || n.includes("terminal") || n.includes("exapump")) return "Running a command";
  // Planning before the write check: "todowrite" contains "write".
  if (n.startsWith("todo") || n === "task" || n.startsWith("team")) return "Planning";
  if (n === "edit" || n.includes("write") || n.includes("patch")) return "Editing files";
  if (n.includes("read") || n.includes("file")) return "Reading files";
  if (n === "grep" || n === "glob" || n === "list" || n.includes("search")) return "Searching";
  if (n.startsWith("todo") || n === "task" || n.startsWith("team")) return "Planning";
  if (n.includes("web")) return "Browsing the web";
  if (n === "question") return "Asking you";
  return "Working";
}

/** Label for the active part: reasoning → Thinking; tool-call → by tool. */
export function workingLabel(partType: string | null, toolName?: string | null): string {
  if (partType === "reasoning") return "Thinking";
  if (partType === "tool-call") return toolGerund(toolName ?? "");
  return "Working";
}

/** "Thinking… · 12s" — seconds shown once they're meaningful. */
export function workingStatus(label: string, elapsedSeconds: number): string {
  return elapsedSeconds >= 3 ? `${label}… · ${Math.floor(elapsedSeconds)}s` : `${label}…`;
}
