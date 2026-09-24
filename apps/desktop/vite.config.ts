import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: rootDir,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src")
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Heavy, independent vendors get their own chunks. Without this the
        // single entry chunk passed 8 MB, which is more than the
        // es-module-lexer WASM that vite's import analysis runs on can take —
        // it fails with "Parse error @:1:1" and the production build dies.
        // Splitting also lets the shell paint before Monaco/echarts arrive.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("echarts") || id.includes("zrender")) return "echarts";
          if (id.includes("recharts") || id.includes("/d3-")) return "recharts";
          if (id.includes("mermaid")) return "mermaid";
          if (id.includes("@xyflow") || id.includes("@dagrejs")) return "flow";
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 4173
  },
  preview: {
    host: "127.0.0.1",
    port: 4174
  }
});
