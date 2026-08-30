import { defineConfig } from "vitest/config";

// `.mts` so Vite loads it as ESM without the CommonJS-interop warning.
//
// No vite-tsconfig-paths plugin: Vite resolves the `@/` alias from tsconfig
// natively now, and the plugin only earns its place if that stops being true.
//
// `node`, not jsdom — everything under test is a pure function. Nothing mounts,
// so there is no reason to pay for a DOM or add a second testing library.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
  },
});
