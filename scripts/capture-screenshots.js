#!/usr/bin/env node
/**
 * Captures a full-page PNG of every page in `pages.config.js` without
 * running (or diffing against) the visual-regression baselines.
 *
 * Useful when you want to eyeball what a page actually looks like right
 * now — after a plugin update, before deciding whether to accept new
 * baselines, or when a snapshot test fails and you want the current
 * render as a file rather than an attachment in the HTML report.
 *
 * Usage:
 *   npm run screenshots
 *   npm run screenshots -- --only home,events
 *   npm run screenshots -- --viewports desktop --out artifacts
 *   npm run screenshots -- --block-video
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, devices } from 'playwright';

import config from '../playwright.config.js';
import { pagesUnderTest } from '../pages.config.js';
import { triggerLazyImages } from '../utils/lazy-load.js';
import { pauseBackgroundVideo } from '../utils/flaky-elements.js';
import {
  unlockDocumentScroll,
  getFullPageHeight,
} from '../utils/scroll.js';

const { values: flags } = parseArgs({
  options: {
    out: { type: 'string', default: 'screenshots' },
    only: { type: 'string' },
    viewports: { type: 'string', default: 'desktop,mobile' },
    'block-video': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (flags.help) {
  console.log(
    [
      'Capture full-page screenshots of every page in pages.config.js.',
      '',
      'Options:',
      '  --out <dir>          Output directory (default: screenshots)',
      '  --only <names>       Comma-separated page names to capture',
      '  --viewports <list>   Comma-separated: desktop, mobile (default: both)',
      '  --block-video        Abort Vimeo requests instead of capturing frames',
      '  -h, --help           Show this help',
    ].join('\n')
  );
  process.exit(0);
}

// Reuse the suite's viewport definitions so a capture matches the
// dimensions the visual-regression baselines are diffed at.
const { defaultBrowserType: _webkit, ...mobileDevice } = devices['iPhone 15 Pro'];

const VIEWPORTS = {
  desktop: { use: { viewport: { width: 1440, height: 900 } } },
  // The suite forces Chromium here too, so a mobile capture is diffable
  // against the chromium-mobile baselines.
  mobile: { use: mobileDevice },
};

const baseURL = config.use?.baseURL;
if (!baseURL) {
  console.error('No baseURL set in playwright.config.js — cannot resolve page paths.');
  process.exit(1);
}

const requestedViewports = flags.viewports
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

const unknownViewports = requestedViewports.filter((name) => !VIEWPORTS[name]);
if (unknownViewports.length) {
  console.error(
    `Unknown viewport(s): ${unknownViewports.join(', ')}. Available: ${Object.keys(VIEWPORTS).join(', ')}.`
  );
  process.exit(1);
}

const only = flags.only
  ? new Set(flags.only.split(',').map((name) => name.trim()).filter(Boolean))
  : null;

const targets = pagesUnderTest.filter((page) => !only || only.has(page.name));
if (!targets.length) {
  console.error(
    only
      ? `No pages in pages.config.js match: ${[...only].join(', ')}`
      : 'pages.config.js has no pages to capture.'
  );
  process.exit(1);
}

const outDir = path.resolve(process.cwd(), flags.out);
const failures = [];
const warnings = [];
const written = [];

const browser = await chromium.launch();

for (const viewportName of requestedViewports) {
  const { use } = VIEWPORTS[viewportName];
  const viewportDir = path.join(outDir, viewportName);
  await mkdir(viewportDir, { recursive: true });

  for (const pageUnderTest of targets) {
    const filePath = path.join(viewportDir, `${pageUnderTest.name}.png`);
    const context = await browser.newContext({ ...use, baseURL });

    try {
      if (flags['block-video'] || pageUnderTest.hasLeadspaceVideo) {
        await context.route('**://player.vimeo.com/**', (route) => route.abort());
      }

      const page = await context.newPage();
      await page.goto(pageUnderTest.path, {
        waitUntil: 'load',
        timeout: 60_000,
      });

      // This theme scrolls an inner wrapper, which would otherwise make
      // fullPage: true capture a single viewport and make scrolling a no-op.
      await unlockDocumentScroll(page);

      if (pageUnderTest.hasLeadspaceVideo && !flags['block-video']) {
        await pauseBackgroundVideo(page);
      }

      try {
        await triggerLazyImages(page);
      } catch (error) {
        // Still capture the page — a missing lazy image is worth seeing in
        // the PNG, but it must not abort the remaining captures.
        warnings.push(
          `${viewportName}/${pageUnderTest.name}: lazy images did not all settle (${error.message.split('\n')[0]})`
        );
      }

      const height = await getFullPageHeight(page);
      await page.screenshot({ path: filePath, fullPage: true });
      const { width, height: viewportHeight } = page.viewportSize();

      // A capture that is exactly one viewport tall means the page is still
      // clipping its own content, so the PNG is not the full page.
      if (height <= viewportHeight + 1) {
        warnings.push(
          `${viewportName}/${pageUnderTest.name}: page is only ${height}px tall — content looks clipped by an inner scroll container`
        );
      }

      written.push(
        `${viewportName}/${pageUnderTest.name} — ${width}x${height} — ${path.relative(process.cwd(), filePath)}`
      );
    } catch (error) {
      failures.push(
        `${viewportName}/${pageUnderTest.name} (${pageUnderTest.path}): ${error.message.split('\n')[0]}`
      );
    } finally {
      await context.close();
    }
  }
}

await browser.close();

for (const line of written) console.log(`saved  ${line}`);
for (const line of warnings) console.warn(`warn   ${line}`);
for (const line of failures) console.error(`fail   ${line}`);

console.log(
  `\n${written.length} screenshot(s) written to ${path.relative(process.cwd(), outDir) || '.'}/` +
    (warnings.length ? `, ${warnings.length} warning(s)` : '') +
    (failures.length ? `, ${failures.length} failure(s)` : '')
);

process.exit(failures.length ? 1 : 0);
