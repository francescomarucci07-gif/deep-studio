import { defineConfig } from "@playwright/test";

// Test nel browser dello studio (tests/e2e). `npm run test:e2e`: costruisce il sito con un Supabase finto, lo avvia
// sulla porta 3210 e apre la pagina di prova /prova-studio (esiste solo con DS_PROVA=1).
const PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    viewport: { width: 1366, height: 650 },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/prova-studio`,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DS_PROVA: "1",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "prova",
    },
  },
});
