import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts (not merged via `mergeConfig`) because the PWA plugin
// there has no business running under test, and keeping them independent avoids
// coupling test setup to whatever the build config grows into later.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
