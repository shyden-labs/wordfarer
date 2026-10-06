/**
 * Which Worker answers which path. Kept out of index.ts because a Worker's
 * entry module may export only handlers: workerd refuses any other export at
 * startup (measured, #332).
 */

/**
 * Paths a caller without the password must reach. GitHub's webhook cannot
 * send Basic credentials, and each delivery is signed instead (#341). Until
 * #341 builds the handler, the path answers 404.
 */
export const EXEMPT_PATHS: readonly string[] = ['/hooks/github'];

/** The game's paths, forwarded to the game Worker. */
export function isGamePath(pathname: string): boolean {
  return pathname === '/play' || pathname.startsWith('/play/');
}
