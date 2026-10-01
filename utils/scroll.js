/**
 * This theme locks the document and scrolls an inner wrapper instead:
 * `body` is `height: 100vh; overflow: hidden` and `div.theme-app` is the
 * real scroller (~8.4k px tall on the home page). Two things break as a
 * result, both silently:
 *
 *   1. `screenshot({ fullPage: true })` sizes itself from the *document*,
 *      so it captures a single viewport and throws away ~90% of the page.
 *   2. `window.scrollTo()` / `window.scrollBy()` do nothing at all, so any
 *      lazy-load helper that scrolls the window never actually moves and
 *      below-the-fold content stays unloaded.
 *
 * `unlockDocumentScroll` fixes (1) by putting the inner scroller back into
 * normal document flow. `scrollThroughPage` fixes (2) by scrolling whatever
 * is actually scrollable, so it works with or without the unlock applied.
 */

const UNLOCKED_CLASS = 'pw-scroll-unlocked';

/**
 * Stops the page from clipping its own content, so a full-page screenshot
 * captures the whole document. Call this before screenshotting and before
 * any scrolling that needs to reach below-the-fold content.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function unlockDocumentScroll(page) {
  await page.addStyleTag({
    content: `html, body { overflow: visible !important; height: auto !important; }`,
  });

  // Unlock whichever element is doing the scrolling rather than assuming a
  // class name — the container differs per page/template.
  const unlocked = await page.evaluate((className) => {
    let scroller = null;
    let largest = 0;

    for (const el of document.body.querySelectorAll('*')) {
      if (!['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) continue;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow > largest) {
        largest = overflow;
        scroller = el;
      }
    }

    if (!scroller) return false;
    scroller.classList.add(className);
    return true;
  }, UNLOCKED_CLASS);

  if (unlocked) {
    await page.addStyleTag({
      content: `.${UNLOCKED_CLASS} { overflow: visible !important; height: auto !important; max-height: none !important; }`,
    });
  }
}

/**
 * Scrolls the page from top to bottom and back in viewport-sized steps,
 * pausing at each one so IntersectionObserver callbacks and native lazy
 * loading actually fire for content passing through the viewport. Returns
 * the scroll position to the top.
 *
 * Scrolls the document when it is scrollable and otherwise falls back to
 * the largest inner scroller, so it is safe to call on a page whose
 * document scrolling is still locked.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
export async function scrollThroughPage(page) {
  await page.evaluate(async () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    const step = Math.max(Math.floor(window.innerHeight / 2), 200);

    const resolveScroller = () => {
      if (document.scrollingElement.scrollHeight > window.innerHeight + 1) {
        return document.scrollingElement;
      }
      let scroller = null;
      let largest = 0;
      for (const el of document.body.querySelectorAll('*')) {
        if (!['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) continue;
        const overflow = el.scrollHeight - el.clientHeight;
        if (overflow > largest) {
          largest = overflow;
          scroller = el;
        }
      }
      return scroller || document.scrollingElement;
    };

    const scroller = resolveScroller();
    const max = scroller.scrollHeight;

    for (let y = 0; y < max; y += step) {
      scroller.scrollTop = y;
      await settle();
    }
    scroller.scrollTop = max;
    await new Promise((resolve) => setTimeout(resolve, 500));

    for (let y = max; y > 0; y -= step) {
      scroller.scrollTop = y;
      await settle();
    }
    scroller.scrollTop = 0;
    await settle();
  });
}

/**
 * The height a full-page screenshot will capture, in CSS pixels.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number>}
 */
export async function getFullPageHeight(page) {
  return page.evaluate(
    () => document.documentElement.scrollHeight || document.body.scrollHeight
  );
}
