import path from "node:path";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: [
            "tests/ui/**/*.test.{ts,tsx}",
            "tests/import/**/*.test.{ts,tsx}",
          ],
          setupFiles: ["tests/setup-ui.ts"],
          // let Vite resolve next-intl's extensionless "next/server" import
          server: { deps: { inline: ["next-intl"] } },
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          fileParallelism: false,
          env: dotenv.config({ path: ".env.test", quiet: true }).parsed ?? {},
        },
      },
    ],
  },
});
