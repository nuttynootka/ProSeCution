import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Some sandboxes preinstall Chromium at a build number pinned to a different
// Playwright version than ours, and block the download that would fix the mismatch.
// Where such a binary exists, use it; everywhere else (CI, local machines) fall back
// to Playwright's own managed browser.
const BUNDLED_CHROMIUM =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const launchOptions = {
  ...(existsSync(BUNDLED_CHROMIUM) ? { executablePath: BUNDLED_CHROMIUM } : {}),
  // Fake camera device: Chunk 8's camera-capture tests need getUserMedia to resolve
  // to a real, decodable synthetic video feed (a moving test pattern), not an actual
  // webcam — confirmed this produces genuine frames before relying on it.
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
}

// Pixel 7 emulation keeps verification honest: this app is Android-only, and the
// mockup is drawn at phone width.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
  },
  projects: [
    {
      name: 'android-phone',
      use: {
        ...devices['Pixel 7'],
        launchOptions,
        permissions: ['camera'],
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
