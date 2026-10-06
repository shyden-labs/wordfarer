/**
 * A stand-in for the game Worker in the site's harness tests: it answers with
 * what the site Worker forwarded, so a test can see the path, the query and
 * the credentials that reached the GAME binding.
 *
 * The real game cannot run here. Local workerd serves static assets for the
 * harness's primary Worker only: with the site first, every game asset
 * answered 500, and the same game alone answered 200 (measured with
 * wrangler 4.145.0, #332). The real game is tested alone in
 * apps/web/test/game.test.ts, and the two together on dev by
 * scripts/verify-dev.ts.
 */
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    return Response.json({
      game: true,
      method: request.method,
      pathname: url.pathname,
      search: url.search,
      authorization: request.headers.get('Authorization'),
    });
  },
};
