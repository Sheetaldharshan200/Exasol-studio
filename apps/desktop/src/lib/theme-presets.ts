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
    dots: ["#7c3aed", "#ddd6fe"],
    light: P("#7c3aed", "#ffffff", { "--accent": "#f3efff", "--secondary": "#f0edf9" }),
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

const PRESET_KEY = "studio.theme.preset";
const RADIUS_KEY = "studio.theme.radius";
const STYLE_ID = "studio-theme-preset";

export function storedPresetId(): string {
  return localStorage.getItem(PRESET_KEY) ?? "default";
}
export function storedRadius(): string {
  return localStorage.getItem(RADIUS_KEY) ?? "0.5rem";
}

/** Apply (and persist) a preset + radius by injecting an override stylesheet. */
export function applyThemePreset(presetId: string = storedPresetId(), radius: string = storedRadius()) {
  const preset = THEME_PRESETS.find((p) => p.id === presetId) ?? THEME_PRESETS[0];
  localStorage.setItem(PRESET_KEY, preset.id);
  localStorage.setItem(RADIUS_KEY, radius);
  const vars = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}: ${v};`).join(" ");
  const radiusLine = radius !== "0.5rem" ? `--radius: ${radius};` : "";
  const css = `:root { ${vars(preset.light)} ${radiusLine} }\n.dark { ${vars(preset.dark)} }`;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}
