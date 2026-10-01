// Production safety at the one place every run of the app passes through
// (ipc.executeSql): the editor, notebooks, object menus and Studio's own
// confirmed changes alike. The connection's settings are read fresh for
// each run, so switching connections can never leave the old ones in force.

import { confirmsDanger, ENVIRONMENTS, withConnDefaults, type ConnSettings } from "./conn-settings.ts";
import { classifyScript, dangerQuestion, readOnlyRefusal } from "./sql-classify.ts";

export type GuardDecision = { refuse?: string; ask?: string };

/** Refuse (read-only + a write), ask (a destructive statement where that
 *  is confirmed), or neither. */
export function guardDecision(settings: ConnSettings, sql: string, split: boolean, name: string): GuardDecision {
  const stmts = classifyScript(sql, split);
  if (settings.safety.readOnly) {
    const refuse = readOnlyRefusal(stmts, name);
    if (refuse) return { refuse };
  }
  if (confirmsDanger(settings.safety)) {
    const env = ENVIRONMENTS.find((e) => e.value === settings.safety.env && e.value !== "none");
    const ask = dangerQuestion(stmts, env ? `${name} (${env.label})` : name);
    if (ask) return { ask };
  }
  return {};
}

type Deps = {
  setRunGuard: (fn: ((req: { profileId: string; connectionName: string; sql: string; split: boolean }) => Promise<void>) | null) => void;
  settingsOf: (profileId: string) => Promise<unknown>;
  confirm: (question: string) => boolean;
};

/** Install the guard; returns its removal. */
export function installRunGuard({ setRunGuard, settingsOf, confirm }: Deps): () => void {
  setRunGuard(async ({ profileId, connectionName, sql, split }) => {
    const settings = withConnDefaults(await settingsOf(profileId).catch(() => null));
    const d = guardDecision(settings, sql, split, connectionName);
    if (d.refuse) throw { kind: "invalid-settings", message: d.refuse };
    if (d.ask && !confirm(d.ask)) throw { kind: "invalid-settings", message: "Not run — you cancelled." };
  });
  return () => setRunGuard(null);
}
