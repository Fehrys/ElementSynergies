import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  webServer: {
    // Two independent guarantees:
    //  1. --strictPort makes Vite FAIL (not silently jump to 5174) if 5173 is taken.
    //  2. reuseExistingServer:false makes Playwright always own its server and never
    //     adopt a stray dev server from another worktree holding 5173.
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    reuseExistingServer: false,
    url: 'http://127.0.0.1:5173/?seed=1',
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
});
