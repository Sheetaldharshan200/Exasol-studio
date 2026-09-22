import type { Classnames } from "react-querybuilder";

// shadcn-styled controls for react-querybuilder so the WHERE builder matches
// the app in both themes.
const INPUT_CLS =
  "h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary/60";
export const RQB_CLASSNAMES: Partial<Classnames> = {
  queryBuilder: "flex flex-col gap-2",
  ruleGroup: "flex flex-col gap-2 rounded-lg border border-border bg-secondary/25 p-2",
  header: "flex flex-wrap items-center gap-1.5",
  body: "flex flex-col gap-1.5 pl-2",
  rule: "flex flex-wrap items-center gap-1.5 rounded-md bg-panel/50 px-1.5 py-1",
  combinators: INPUT_CLS,
  fields: `${INPUT_CLS} max-w-[180px]`,
  operators: INPUT_CLS,
  value: INPUT_CLS,
  addRule:
    "flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
  addGroup:
    "flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
  removeRule:
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive",
  removeGroup:
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive",
};
export const RQB_TRANSLATIONS = {
  addRule: { label: "+ Condition", title: "Add condition" },
  addGroup: { label: "+ Group", title: "Add group" },
  removeRule: { label: "✕", title: "Remove" },
  removeGroup: { label: "✕", title: "Remove group" },
};

