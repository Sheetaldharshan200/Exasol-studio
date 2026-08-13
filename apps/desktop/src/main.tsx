import React from "react";
import ReactDOM from "react-dom/client";
import "@/lib/monaco-setup"; // must run before any <Editor> mounts
import { App } from "@/app/App";
import "@/app/global.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyWindowControlsInset } from "@/lib/platform";
import { applyThemePreset } from "@/lib/theme-presets";
import { installAppLog } from "@/lib/app-log";

installAppLog(); // diagnostics tail FIRST — crashes before this die unrecorded
applyWindowControlsInset();
applyThemePreset(); // restore the user's saved color preset + radius

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);

// Fade out the pre-React boot loader (index.html) once the app has painted.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      window.setTimeout(() => boot.remove(), 220);
    }
  }),
);
