/**
 * The game Worker, served under `/play/` (website spec §7.2). It has no
 * address of its own (`workers_dev: false`, no route): the site Worker
 * forwards `/play/*` through a service binding after its dev gate, so this
 * one needs no gate.
 *
 * It runs before the asset router (`run_worker_first`, #123), because a
 * Content Security Policy must reach the files too, and Cloudflare serves a
 * matching file without running the script otherwise. That costs CPU only:
 * a call over a service binding carries no request fee of its own.
 *
 * So the script now does what the router did for it (measured, #123):
 * `/play` and `/play/*` go to the assets, which still redirect `/play` to
 * `/play/` and `/play/index.html` to `/play/`; a path under `/play/` with no
 * file gets the game's shell, as a single-page app needs; anything else is
 * not found. (`not_found_handling: "single-page-application"` would serve the
 * ROOT index.html, which the game, built into dist/play, does not have;
 * measured in the asset router, #332.)
 */
const BASE = '/play/';

/**
 * The first policy (#123 AC5): the built game needs nothing inline and
 * nothing from another origin. #153 owns the full policy and the other
 * security headers.
 */
const CONTENT_SECURITY_POLICY =
  "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

function withPolicy(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/play' && !url.pathname.startsWith(BASE))
    return new Response('Not found', { status: 404 });
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404 || url.pathname === '/play') return asset;
  return env.ASSETS.fetch(new Request(new URL(BASE, url), request));
}

export default {
  async fetch(request, env): Promise<Response> {
    return withPolicy(await route(request, env));
  },
} satisfies ExportedHandler<Env>;
