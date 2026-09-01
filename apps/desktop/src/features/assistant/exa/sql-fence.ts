// The assistant's FINAL ```sql fence — what the pin auto-apply writes back
// into the pinned query tab or notebook cell. Pure and tested.

export function lastSqlFence(text: string): string | null {
  const re = /```sql\s*\n([\s\S]*?)```/gi;
  let last: string | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const body = m[1].trim();
    if (body) last = body;
  }
  return last;
}
