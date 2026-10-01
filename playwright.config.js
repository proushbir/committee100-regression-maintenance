// @ts-check
import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * Valorea (test-valorea.pantheonsite.io) — post-plugin-update regression suite.
 *
 * Run this after any plugin update on staging to catch:
 *   - unintended visual changes (layout, spacing, styling regressions)
 *   - a broken/altered contact form (Contact Form 7)
 *
 * First run (or whenever a change is intentional), create/refresh baselines:
 *   npx playwright test --update-snapshots
 *
 * Every subsequent run just diffs against those baselines:
 *   npx playwright test
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // screenshots are more stable run one at a time
  workers: 8,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['html', { open: 'never' }], ['list']],

  expect: {
    // CI runners are slower and the Vimeo leadspace video's async pause
    // (postMessage) can take longer to settle than on local machines —
    // give assertions (including toHaveScreenshot's stability check)
    // more time before failing.
    timeout: 30_000,
    toHaveScreenshot: {
      // Small tolerance so font-smoothing / anti-aliasing noise between
      // runs doesn't produce false positives. Full-page desktop screenshots
      // are sensitive enough that 0.04 keeps them stable across runs.
      maxDiffPixelRatio: 0.04,
      animations: 'disabled',
    },
  },

  use: {
    baseURL: process.env.BASE_URL || 'https://pr-2-committee100.pantheonsite.io',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      testMatch: ['**/1-visual-regression/**/*.spec.js'],
      use: {
        ...devices['iPhone 15 Pro'],
        defaultBrowserType: 'chromium', // force Chromium instead of WebKit
      },
    }

  ],
});