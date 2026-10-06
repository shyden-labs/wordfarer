/**
 * The game Worker, served under `/play/` (website spec §7.2). It has no
 * address of its own (`workers_dev: false`, no route): the site Worker
 * forwards `/play/*` through a service binding after its dev gate, so this
 * one needs no gate.
 *
 * Cloudflare serves a matching asset without running this script, so it runs
 * only for a path with no file: a client route under `/play/` gets the game's
 * shell, as a single-page app needs, and anything else is not found.
 * (`not_found_handling: "single-page-application"` would serve the ROOT
 * index.html, which the game, built into dist/play, does not have; measured
 * in the asset router, #332.)
 */
const BASE = '/play/';

export default {
  fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(BASE))
      return Promise.resolve(new Response('Not found', { status: 404 }));
    return env.ASSETS.fetch(new Request(new URL(BASE, url), request));
  },
} satisfies ExportedHandler<Env>;
