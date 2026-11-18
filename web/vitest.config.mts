import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Test veloci della logica (lib/daw): niente browser, pochi secondi. `npm test`
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
