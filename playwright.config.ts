import { defineConfig } from "playwright/test";

export default defineConfig({
  timeout: 60_000,
  use: {
    headless: false, // change to true later
    viewport: { width: 1280, height: 800 },
    actionTimeout: 30_000,
  },
});
