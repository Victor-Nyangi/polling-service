import { defineConfig } from "vitest/config";

// Only the pure helpers in src/lib are unit tested. The pages and components
// are async Server Components, which Vitest does not support -- those belong in
// an end-to-end runner instead, so there is no jsdom environment here.
export default defineConfig({
  // Resolves the "@/*" -> "src/*" alias from tsconfig.json. Vite supports this
  // natively, so the vite-tsconfig-paths plugin is not needed.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
