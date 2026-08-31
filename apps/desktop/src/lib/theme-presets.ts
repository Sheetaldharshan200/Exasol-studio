/**
 * Theme presets (tweakcn-style): each preset overrides a small set of the CSS
 * variables defined in global.css, separately for light (:root) and dark
 * (.dark). Applied by injecting a <style> AFTER the base stylesheet so the
 * cascade wins without touching inline styles (which would break .dark).
 */
export type ThemePreset = {
  id: string;
  name: string;
  /** The two swatch dots shown in the picker (light-mode colors). */
  dots: [string, string];
  light: Record<string, string>;
  dark: Record<string, string>;
};

const P = (primary: string, primaryFg: string, extra: Record<string, string> = {}) => ({
  "--primary": primary,
  "--primary-foreground": primaryFg,
  "--ring": primary,
  "--sidebar-primary": primary,
  "--sidebar-ring": primary,
  "--signal": primary,
  "--signal-foreground": primaryFg,
  ...extra,
});

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default",
    name: "Exasol (default)",
    dots: ["#4fa823", "#0b1730"],
    light: {},
    dark: {},
  },
  {
    id: "modern-minimal",
    name: "Modern Minimal",
    dots: ["#3b82f6", "#e2e8f0"],
    light: P("#3b82f6", "#ffffff", { "--accent": "#e8f0fe", "--secondary": "#eef2f7" }),
    dark: P("#60a5fa", "#0b1220", { "--accent": "#1c2433" }),
  },
  {
    id: "violet-bloom",
    name: "Violet Bloom",
    dots: ["#6d28d9", "#ddd6fe"],
    light: P("#6d28d9", "#ffffff", { "--accent": "#f3efff", "--secondary": "#f0edf9" }),
    dark: P("#a78bfa", "#140b26", { "--accent": "#241a3d" }),
  },
  {
    id: "t3-chat",
    name: "T3 Chat",
    dots: ["#a8355d", "#f3c6d8"],
    light: P("#a8355d", "#ffffff", { "--background": "#faf5f7", "--secondary": "#f3e5ec", "--accent": "#f6e4ed", "--border": "#eddbe4" }),
    dark: P("#d56698", "#1e0a13", { "--background": "#150a10", "--panel": "#1d1016", "--editor": "#150a10", "--titlebar": "#0f070b", "--activitybar": "#0f070b", "--secondary": "#271520", "--accent": "#2b1723" }),
  },
  {
    id: "twitter",
    name: "Twitter",
    dots: ["#1d9bf0", "#0f1419"],
    light: P("#1d9bf0", "#ffffff", { "--accent": "#e3f1fc", "--secondary": "#eaf3fa" }),
    dark: P("#1d9bf0", "#ffffff", { "--background": "#000000", "--editor": "#000000", "--panel": "#0b0e11", "--titlebar": "#060708", "--activitybar": "#060708", "--secondary": "#16181c", "--accent": "#1a1d21" }),
  },
  {
    id: "mocha-mousse",
    name: "Mocha Mousse",
    dots: ["#a47764", "#d9c3b5"],
    light: P("#a47764", "#ffffff", { "--background": "#f7f3f0", "--secondary": "#efe6df", "--accent": "#f0e5dd", "--border": "#e4d5c9" }),
    dark: P("#c29585", "#22130c", { "--background": "#171009", "--panel": "#1f1710", "--editor": "#171009", "--secondary": "#2a2018", "--accent": "#2e231a" }),
  },
  {
    id: "bubblegum",
    name: "Bubblegum",
    dots: ["#e457a3", "#f5d565"],
    light: P("#e457a3", "#ffffff", { "--background": "#fdf6fa", "--secondary": "#fbe6f1", "--accent": "#fdf0c9", "--border": "#f6dcea" }),
    dark: P("#f277b8", "#2a0d1d", { "--background": "#190a12", "--panel": "#221019", "--editor": "#190a12", "--secondary": "#2e1524", "--accent": "#332618" }),
  },
  {
    id: "amethyst-haze",
    name: "Amethyst Haze",
    dots: ["#8a79ab", "#e0d9ef"],
    light: P("#8a79ab", "#ffffff", { "--background": "#f8f7fb", "--secondary": "#ece8f4", "--accent": "#eee9f6", "--border": "#e0dbec" }),
    dark: P("#a995c9", "#191331", { "--background": "#131020", "--panel": "#1a1628", "--editor": "#131020", "--secondary": "#241e37", "--accent": "#28223c" }),
  },
  {
    id: "notebook",
    name: "Notebook",
    dots: ["#57534e", "#d6d3d1"],
    light: P("#57534e", "#ffffff", { "--background": "#f7f6f4", "--secondary": "#ecebe8", "--accent": "#eceae6", "--border": "#dedcd7" }),
    dark: P("#a8a29e", "#181512", { "--background": "#141312", "--panel": "#1c1a19", "--editor": "#141312", "--secondary": "#262422", "--accent": "#2a2825" }),
  },
  {
    id: "doom-64",
    name: "Doom 64",
    dots: ["#b91c1c", "#f59e0b"],
    light: P("#b91c1c", "#ffffff", { "--accent": "#fde8e8", "--secondary": "#f3e8e2", "--warning": "#b45309" }),
    dark: P("#ef4444", "#1c0606", { "--background": "#0f0a0a", "--panel": "#181010", "--editor": "#0f0a0a", "--secondary": "#241616", "--accent": "#2b1a12" }),
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    dots: ["#8839ef", "#89b4fa"],
    light: P("#8839ef", "#ffffff", { "--background": "#eff1f5", "--panel": "#ffffff", "--secondary": "#e6e9ef", "--accent": "#e7ddf6", "--border": "#dce0e8" }),
    dark: P("#cba6f7", "#1e1e2e", { "--background": "#1e1e2e", "--panel": "#252537", "--editor": "#1e1e2e", "--titlebar": "#181825", "--activitybar": "#181825", "--secondary": "#313244", "--accent": "#363653", "--border": "#31324a" }),
  },
];

export const RADIUS_OPTIONS = ["0rem", "0.25rem", "0.5rem", "0.75rem", "1rem"] as const;

/** Free (SIL-OFL) fonts bundled via @fontsource — no licensing strings attached. */
export const SANS_FONTS = [
  { id: "inter", name: "Inter (default)", stack: `"Inter Variable", "Inter", system-ui, sans-serif` },
  { id: "figtree", name: "Figtree", stack: `"Figtree Variable", "Figtree", system-ui, sans-serif` },
  { id: "manrope", name: "Manrope", stack: `"Manrope Variable", "Manrope", system-ui, sans-serif` },
  { id: "space-grotesk", name: "Space Grotesk", stack: `"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif` },
  { id: "source-sans", name: "Source Sans 3", stack: `"Source Sans 3 Variable", "Source Sans 3", system-ui, sans-serif` },
] as const;
export const MONO_FONTS = [
  { id: "jetbrains", name: "JetBrains Mono (default)", stack: `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` },
  { id: "fira-code", name: "Fira Code", stack: `"Fira Code Variable", "Fira Code", ui-monospace, Menlo, monospace` },
] as const;

export type ThemeCustom = {
  presetId: string;
  radius: string;
  /** Custom button/accent color (overrides the preset's primary). */
  primary?: string;
  sansId?: string;
  monoId?: string;
};

const CUSTOM_KEY = "studio.theme.custom.v1";

export function storedTheme(): ThemeCustom {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "null") as ThemeCustom | null;
    if (raw?.presetId) return raw;
  } catch { /* fresh */ }
  // Migrate the older two-key storage.
  return { presetId: localStorage.getItem("studio.theme.preset") ?? "default", radius: localStorage.getItem("studio.theme.radius") ?? "0.5rem" };
}

/** Black or white — whichever reads on the given hex background. */
export function contrastFg(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.55 ? "#0b1220" : "#ffffff";
}

const STYLE_ID2 = "studio-theme-preset";

/** Apply (and persist) the full theme customization. */
export function applyTheme(custom: ThemeCustom) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
  const preset = THEME_PRESETS.find((p) => p.id === custom.presetId) ?? THEME_PRESETS[0];
  const vars = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}: ${v};`).join(" ");

  const globals: Record<string, string> = {};
  if (custom.radius && custom.radius !== "0.5rem") globals["--radius"] = custom.radius;
  if (custom.primary) {
    const fg = contrastFg(custom.primary);
    Object.assign(globals, {
      "--primary": custom.primary, "--primary-foreground": fg, "--ring": custom.primary,
      "--sidebar-primary": custom.primary, "--sidebar-ring": custom.primary,
      "--signal": custom.primary, "--signal-foreground": fg,
    });
  }
  const sans = SANS_FONTS.find((f) => f.id === custom.sansId);
  if (sans && sans.id !== "inter") { globals["--font-sans"] = sans.stack; globals["--font-heading"] = sans.stack; }
  const mono = MONO_FONTS.find((f) => f.id === custom.monoId);
  if (mono && mono.id !== "jetbrains") globals["--font-mono"] = mono.stack;

  // Light overrides are scoped to :root:not(.dark): the injected sheet loads
  // last, so a bare :root block would beat the BASE .dark rules and leak
  // light-mode colors into dark mode (the "invisible white text" bug).
  const css =
    `:root:not(.dark) { ${vars(preset.light)} }
` +
    `.dark { ${vars(preset.dark)} }
` +
    `:root { ${vars(globals)} }`;
  let el = document.getElementById(STYLE_ID2) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID2;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/** Back-compat boot/apply entry (used by main.tsx and older callers). */
export function applyThemePreset(presetId?: string, radius?: string) {
  const cur = storedTheme();
  applyTheme({ ...cur, presetId: presetId ?? cur.presetId, radius: radius ?? cur.radius });
}
