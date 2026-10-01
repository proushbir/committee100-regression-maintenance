import { test, expect } from '@playwright/test';
import { pagesUnderTest } from '../../pages.config.js';
import { triggerLazyImages } from '../../utils/lazy-load.js';
import { getFlakyElements, pauseBackgroundVideo } from '../../utils/flaky-elements.js';
import { unlockDocumentScroll } from '../../utils/scroll.js';

test.describe('Visual regression', () => {
  for (const pageUnderTest of pagesUnderTest) {
    test(`${pageUnderTest.name} — full page matches baseline`, async ({ page }) => {
      if (pageUnderTest.hasLeadspaceVideo) {
        // Block the Vimeo player entirely so it never loads/animates —
        // far more reliable than pausing it after the fact via postMessage,
        // which is async and can lag on slower CI runners, causing the
        // screenshot's "wait for stable frame" check to time out.
        await page.route('**://player.vimeo.com/**', (route) => route.abort());
      }

      await page.goto(pageUnderTest.path, { waitUntil: 'load' });

      // This theme locks the document and scrolls an inner wrapper, so
      // `fullPage: true` would otherwise capture a single viewport and
      // compare pages on their first screenful only.
      await unlockDocumentScroll(page);

      if (pageUnderTest.hasLeadspaceVideo) {
        await pauseBackgroundVideo(page);
      }

      // Simulate a real visitor: scroll gradually to trigger lazy-loaded images
      await triggerLazyImages(page);

      // Exclude flaky elements from the screenshot diff
      const masks = await getFlakyElements(page);

      await expect(page).toHaveScreenshot(`${pageUnderTest.name}-full.png`, {
        fullPage: true,
        mask: masks,
      });
    }); 
  } //
});