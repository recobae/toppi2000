import { defineConfig } from "vitest/config";
import path from "path";

// Reine Unit-Test-Konfiguration (Lohnt-sich-Umbau, Phase 6) -- kein Next.js-
// Server nötig, nur der "@/*" Pfad-Alias aus tsconfig.json wird gespiegelt,
// damit lib/-Module unverändert importierbar sind.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
