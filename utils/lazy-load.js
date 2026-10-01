import { scrollThroughPage } from './scroll.js';

/**
 * Ensures all images on the page are fully loaded before taking a visual screenshot.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function triggerLazyImages(page) {
  // 1. Promote data-src based lazy loaders to real src attributes and force
  //    native lazy images to load immediately. A loader driven by an
  //    IntersectionObserver never fires for images the layout already keeps
  //    hidden, so swapping the attributes is the only reliable way to get
  //    those bytes into the screenshot.
  await page.evaluate(() => {
    document.querySelectorAll('img').forEach((img) => {
      const src =
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-original');
      if (!img.getAttribute('src') && src) {
        img.setAttribute('src', src);
      }

      const srcset =
        img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
      if (!img.getAttribute('srcset') && srcset) {
        img.setAttribute('srcset', srcset);
      }

      if (img.getAttribute('loading') === 'lazy') {
        img.setAttribute('loading', 'eager');
      }
    });
  });

  // 2. Scroll the page in small steps, down and back up again, pausing at
  //    each one, so every image passes through the viewport and both native
  //    lazy loading and any IntersectionObserver actually fire. This theme
  //    scrolls an inner wrapper rather than the document, so the scroll
  //    helper targets whichever element is really the scroller — a plain
  //    window.scrollTo() is a no-op here and leaves images below the fold
  //    unloaded.
  await scrollThroughPage(page);

  // 3. Wait for every *rendered* image to finish loading. Images the layout
  //    hides (e.g. a decorative figure collapsed to a few pixels) contribute
  //    nothing to a screenshot and are frequently never given a src at all,
  //    so waiting on them would burn the whole test timeout.
  await page.waitForFunction(
    () => {
      const images = Array.from(document.querySelectorAll('img'));
      return images.every((img) => {
        const style = window.getComputedStyle(img);
        const rect = img.getBoundingClientRect();
        const isRendered =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0;

        return !isRendered || (img.complete && img.naturalWidth > 0);
      });
    },
    undefined,
    { timeout: 15_000 }
  );
}
