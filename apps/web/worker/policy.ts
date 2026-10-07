/**
 * The game's first Content Security Policy (#123 AC5): the built game needs
 * nothing inline and nothing from another origin. #153 owns the full policy
 * and the other security headers.
 *
 * One home, read by the Worker that sets it and by scripts/verify-dev.ts,
 * which checks dev serves it; apps/web/test/game.test.ts pins it as a
 * literal, so a change here is a deliberate edit in two places.
 */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
