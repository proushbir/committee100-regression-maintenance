/**
 * Shared selectors for the Contact Form 7 footer form (/). Keep the field
 * IDs/classes in one place — CF7 lets theme authors rename them, so a
 * plugin update that changes the markup only needs a fix here.
 */
export const contactForm = {
  // The wrapping CF7 <form> element.
  form: 'form.wpcf7-form',
  name: '#name',
  email: '#email_address',
  message: '#message',
  submit: 'button:has-text("Submit")',
  // CF7 renders the validation summary here.
  responseOutput: '.wpcf7-response-output',
  // Field-level validation tips, keyed by the mail-tag data-name.
  tip: (dataName) => `[data-name="${dataName}"] .wpcf7-not-valid-tip`,
};