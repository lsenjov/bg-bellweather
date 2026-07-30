import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false
    },
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    },
    include: [
      "apps/*/test/**/*.test.{ts,tsx}",
      "packages/*/test/**/*.test.{ts,tsx}"
    ]
  }
});
