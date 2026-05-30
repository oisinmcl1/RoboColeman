import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // Engine logic is pure TS with no DOM — run it in plain Node, which is
    // faster and avoids pulling in jsdom.
    environment: 'node',
    // Discover *.test.ts / *.spec.ts anywhere except deps and build output.
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    // Mirror the "@/*" -> project-root alias from tsconfig.json so test files
    // can import via "@/lib/..." the same way the app code does.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});