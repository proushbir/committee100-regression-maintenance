import { expect } from '@playwright/test';

/**
 * WordPress admin helpers used to temporarily swap the Contact Form 7
 * recipient for the duration of the contact-form suite and restore it
 * afterwards.
 *
 * @param {import('@playwright/test').Page} page
 */

export const ADMIN_LOGIN_URL = '/admin-console/';

// "Get In Touch" contact form (post ID 146) editor — Mail tab holds the
// "To:" recipient field.
export const CONTACT_FORM_EDIT_URL =
  '/wp-admin/admin.php?page=wpcf7&post=146&action=edit';

export async function loginAsAdmin(page) {
  await page.goto(ADMIN_LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('#user_login').fill(process.env.WP_ADMIN_USER);
  await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASS);
  await page.locator('#wp-submit').click();
  // The admin bar is only rendered for authenticated sessions.
  await expect(page.locator('#wpadminbar')).toBeVisible();
}

export async function openContactFormMailTab(page) {
  await page.goto(CONTACT_FORM_EDIT_URL, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Mail', exact: true }).click();
  await expect(page.locator('#wpcf7-mail-recipient')).toBeVisible();
}

export async function setContactFormRecipient(page, email) {
  const recipientField = page.locator('#wpcf7-mail-recipient');
  await recipientField.fill('');
  await recipientField.fill(email);
  await saveContactForm(page);
  await expect(page.locator('#wpcf7-mail-recipient')).toHaveValue(email);
}

export async function getContactFormRecipient(page) {
  await expect(page.locator('#wpcf7-mail-recipient')).toBeVisible();
  return page.locator('#wpcf7-mail-recipient').inputValue();
}

export async function saveContactForm(page) {
  await page
    .locator('#publishing-action')
    .getByRole('button', { name: 'Save' })
    .click();
}