/**
 * The homepage leadspace embeds a Vimeo background video
 * (autoplay=1&muted=1&loop=1) inside `.js-vimeo-video-container`. It is
 * always mid-animation, so pixel-diffing it will flag a "regression" on
 * effectively every run whether or not anything actually changed. Rather
 * than trying to wait for it to "settle" (it never does), we exclude it
 * from the comparison.
 *
 * Returns the locators that should be passed to `toHaveScreenshot`'s
 * `mask` option. Safe to call on pages that don't have the video —
 * it just returns an empty array.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator[]>}
 */
export async function getFlakyElements(page) {
  const masks = [];

  const videoContainer = page.locator('.js-vimeo-video-container');
  if (await videoContainer.count()) {
    masks.push(videoContainer);
  }

  return masks;
}

/**
 * Belt-and-braces alongside the mask above: pause the Vimeo player via its
 * postMessage API so it stops animating for the rest of the test. This
 * doesn't replace the mask (Vimeo's player takes a moment to acknowledge
 * the pause call, and background players tend to resume on their own) but
 * it reduces any knock-on layout thrash from the video element while other
 * checks (e.g. lazy-load scrolling) are running.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function pauseBackgroundVideo(page) {
  const iframe = page.locator('iframe[id^="vimeo-player"]');
  if (!(await iframe.count())) return;

  await iframe
    .evaluate((el) => {
      el.contentWindow?.postMessage(JSON.stringify({ method: 'pause' }), '*');
    })
    .catch(() => {
      // If the Vimeo player iframe isn't ready to receive postMessage calls
      // yet, that's fine — the screenshot mask above still fully covers it.
    });
}
