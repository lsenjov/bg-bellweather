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
      "examples/test/**/*.test.ts",
      "apps/*/test/**/*.test.{ts,tsx}",
      "packages/*/test/**/*.test.{ts,tsx}"
    ]
  }
});
