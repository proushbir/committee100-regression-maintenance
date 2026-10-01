import { test, expect } from '@playwright/test';
import { contactForm } from '../utils/selectors.js';
import {
  loginAsAdmin,
  openContactFormMailTab,
  getContactFormRecipient,
  setContactFormRecipient,
} from '../utils/wp-admin.js';

/**
 * This suite deliberately stops at client-side validation. It never
 * submits a fully valid entry unless RUN_HAPPY_PATH=1 is set, so
 * re-running it after every plugin update won't spam real leads into the
 * site's mail/CRM pipeline.
 *
 * The CF7 recipient is swapped to WP_TEST_RECIPIENT_EMAIL for the whole
 * file (beforeAll) and restored to whatever it was (afterAll), so both the
 * validation tests and the optional happy-path test always send to the
 * throwaway address. State lives in memory only — no cross-file ordering
 * or state files needed.
 */
test.describe('Contact form validation', () => {
  let originalRecipient = '';
  let recipientSwapped = false;

  test.beforeAll(async ({ browser }) => {
    const { WP_ADMIN_USER, WP_ADMIN_PASS, WP_TEST_RECIPIENT_EMAIL } =
      process.env;
    if (!WP_ADMIN_USER || !WP_ADMIN_PASS) {
      throw new Error(
        'WP_ADMIN_USER and WP_ADMIN_PASS must be set in the .env file.'
      );
    }
    if (!WP_TEST_RECIPIENT_EMAIL) {
      throw new Error(
        'WP_TEST_RECIPIENT_EMAIL must be set in the .env file (the address to swap the form to).'
      );
    }

    // beforeAll has no `page` fixture, so drive the admin swap from a
    // throwaway context.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsAdmin(page);
      await openContactFormMailTab(page);
      originalRecipient = await getContactFormRecipient(page);
      await setContactFormRecipient(page, WP_TEST_RECIPIENT_EMAIL);
      recipientSwapped = true;
      console.log(`[contact-form] Swapped "To:" recipient to: ${WP_TEST_RECIPIENT_EMAIL}`);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // Only restore if a swap actually happened — a failed login in
    // beforeAll must not clobber the live form's recipient.
    if (!recipientSwapped) return;

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAsAdmin(page);
      await openContactFormMailTab(page);
      await setContactFormRecipient(page, originalRecipient);
      console.log(`[contact-form] Restored "To:" recipient to: ${originalRecipient}`);
    } finally {
      await context.close();
    }
  });

  test.describe('Home page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });

      // The form sits at the very end of the page — scroll it into view
      // the way a real visitor would reach it.
      await page.locator(contactForm.form).scrollIntoViewIfNeeded();
    });

    test('shows required-field errors when submitted empty', async ({ page }) => {
      const form = page.locator(contactForm.form);

      await form.locator(contactForm.submit).click();

      await expect(form).toHaveClass(/invalid/);
      await expect(page.locator(contactForm.responseOutput)).toHaveText(
        'Please complete all required fields.'
      );
    });

    test('shows an invalid-email error for a malformed email address', async ({ page }) => {
      const form = page.locator(contactForm.form);

      await form.locator(contactForm.name).fill('QA Regression Test');
      await form.locator(contactForm.email).fill('not-an-email');
      await form.locator(contactForm.submit).click();

      await expect(page.locator(contactForm.responseOutput)).toHaveText(
        'Please enter an valid email address.'
      );
    });

    test('field-level errors clear once valid values are entered', async ({ page }) => {
      const form = page.locator(contactForm.form);

      // Trigger the empty-state errors first...
      await form.locator(contactForm.submit).click();
      await expect(form).toHaveClass(/invalid/);

      // ...then confirm CF7's live validation clears them once the
      // fields hold valid values. We stop here rather than submitting —
      // this suite checks the form's validation behaviour survives a
      // plugin update, not the mail-delivery pipeline.
      await form.locator(contactForm.name).fill('QA Regression Test');
      await form.locator(contactForm.email).fill('qa-regression@example.com');

      await expect(page.locator(contactForm.tip('fullname'))).toBeHidden();
      await expect(page.locator(contactForm.tip('email_address'))).toBeHidden();
    });
  });

  test.describe('Happy path', () => {
    const runHappyPath = process.env.RUN_HAPPY_PATH === '1';
    // Sends a real form submission to the swapped (test) recipient — off
    // by default so a routine regression run never touches the form's real
    // destination.
    test.skip(
      !runHappyPath,
      'Enable with RUN_HAPPY_PATH=1 to submit a real form entry.'
    );

    test.beforeEach(async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.locator(contactForm.form).scrollIntoViewIfNeeded();
    });

    test('submits successfully with valid values', async ({ page }) => {
      const form = page.locator(contactForm.form);

      await form.locator(contactForm.name).fill('QA Regression Test');
      await form
        .locator(contactForm.email)
        .fill(process.env.WP_TEST_RECIPIENT_EMAIL);
      await form
        .locator(contactForm.message)
        .fill('This is a test message from the Valorea regression suite.');
      await form.locator(contactForm.submit).click();

      await expect(page.locator(contactForm.responseOutput)).toHaveText(
        'Thank you for your message. It has been sent.'
      );
    });
  });
});