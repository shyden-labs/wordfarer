/**
 * The dev hostname adapter's one Function (#429), on every path (`[[path]]`
 * matches the root too). It forwards each request, unchanged, to the Worker
 * its host names in ../hosts.ts: the site Worker (`SITE`), whose gate, game
 * binding and pages stay as they are, or the sync Worker (`SYNC`).
 *
 * Any other host answers 404 and reaches neither Worker. That covers the
 * project's own pages.dev address and every preview deployment's, which are
 * public, so the Workers are reached only through the dev hostnames.
 */
import { DEV_HOSTS } from '../hosts';

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  const binding = DEV_HOSTS.get(new URL(request.url).hostname);
  if (binding === undefined)
    return new Response('not found', {
      status: 404,
      headers: { 'cache-control': 'no-store' },
    });
  return env[binding].fetch(request);
};
