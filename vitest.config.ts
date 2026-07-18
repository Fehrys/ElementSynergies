import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Vitest owns the pure-logic tests under tests/core, the Phaser-free
    // scene-layout tests under tests/scenes, and the produced-asset-file
    // validation under tests/assets. Playwright's tests/e2e specs are
    // deliberately excluded (they run under `npm run test:e2e`).
    include: ['tests/core/**/*.test.ts', 'tests/scenes/**/*.test.ts', 'tests/assets/**/*.test.ts'],
  },
});
