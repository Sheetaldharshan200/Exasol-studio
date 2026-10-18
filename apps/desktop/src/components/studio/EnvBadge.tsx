// The connection's environment tag (Properties → Environment and Safety):
// a small coloured label, so Prod is never mistaken for Dev.

import { ENVIRONMENTS, type Environment } from "@/lib/conn-settings";

export function envOf(env: Environment | undefined) {
  return ENVIRONMENTS.find((e) => e.value === env && e.value !== "none") ?? null;
}

export function EnvBadge({ env, className }: { env: Environment | undefined; className?: string }) {
  const e = envOf(env);
  if (!e) return null;
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[9px] leading-none font-bold tracking-wide uppercase ${className ?? ""}`}
      style={{ color: e.color, backgroundColor: `color-mix(in srgb, ${e.color} 16%, transparent)` }}
      title={`${e.label} environment`}
    >
      {e.label}
    </span>
  );
}
