import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import "@/app/global.css";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { applyWindowControlsInset } from "@/lib/platform";

applyWindowControlsInset();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>
);
