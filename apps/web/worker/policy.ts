/**
 * The game's first Content Security Policy (#123 AC5): the built game needs
 * nothing inline and nothing from another origin. #153 owns the full policy
 * and the other security headers.
 *
 * Its one script from elsewhere is Cloudflare Web Analytics' beacon (#451;
 * website spec W17), which Cloudflare injects at
 * `https://static.cloudflareinsights.com/beacon.min.js/<version>`. The source
 * ends in `/` because a path without one matches that path alone (CSP3),
 * which refuses every versioned URL: measured in Chromium, Firefox and WebKit.
 * The beacon reports to this origin's own `/cdn-cgi/rum` under automatic
 * setup, so `default-src 'self'` covers it and `connect-src` adds nothing.
 *
 * One home, read by the Worker that sets it and by scripts/verify-dev.ts,
 * which checks dev serves it; apps/web/test/game.test.ts pins it as a
 * literal, so a change here is a deliberate edit in two places.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com/beacon.min.js/; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
