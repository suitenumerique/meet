import { defineConfig } from "@playwright/test"

export default defineConfig({
     testDir: "./tests-e2e",
     use: {
          baseURL: "http://localhost:3000",
          headless: true,
          actionTimeout: 10_000,
     },
     timeout: 60_000,
})
