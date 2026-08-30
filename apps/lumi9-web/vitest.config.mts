import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `.mts` so Vite loads it as ESM without the CommonJS-interop warning.
//
// No vite-tsconfig-paths plugin: Vite resolves the `@/` alias from tsconfig
// natively now, and the plugin only earns its place if that stops being true.
//
// `node`, not jsdom — everything under test is a pure function. Nothing mounts,
// so there is no reason to pay for a DOM or add a second testing library.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws on import outside a Next server, so a pure helper
      // that happens to live in a module declaring that boundary cannot be
      // reached from here without it. femi9-web stubs it the same way.
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "test/**/*.test.ts"],
  },
});
