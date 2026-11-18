interface StripeBrowser {
  navigator: { userAgent: string };
  location: { assign: (url: string) => void };
  $agent?: unknown;
  natively?: {
    openExternalURL?: (url: string, external: boolean) => void;
  };
}

/**
 * Hosted Connect onboarding requires a real browser. Normal location changes
 * in Natively open its in-app browser, which can reject otherwise valid links.
 * Never log, prefetch, or retry these single-use account links.
 */
export function openOrganizerStripeUrl(url: string, browser: StripeBrowser = window): void {
  let destination: URL;
  try {
    destination = new URL(url);
  } catch {
    throw new Error('Stripe returned an invalid page address. Please try setup again.');
  }
  if (destination.protocol !== 'https:' ||
      !['connect.stripe.com', 'dashboard.stripe.com'].includes(destination.hostname) ||
      destination.username || destination.password || destination.port) {
    throw new Error('Stripe returned an invalid page address. Please try setup again.');
  }

  const nativeShell = typeof browser.$agent !== 'undefined' ||
    /Natively(?:\/|\s*)?(?:Android|iOS|iPadOS)/i.test(browser.navigator.userAgent);
  if (nativeShell) {
    if (typeof browser.natively?.openExternalURL !== 'function') {
      throw new Error('The external browser is not ready. Reopen the app and try again, or use Payments in your web browser.');
    }
    try {
      browser.natively.openExternalURL(url, true);
    } catch {
      // Native errors can contain the sensitive, single-use setup URL.
      throw new Error('Could not open your external browser. Please try again, or use Payments in your web browser.');
    }
    return;
  }
  browser.location.assign(url);
}
