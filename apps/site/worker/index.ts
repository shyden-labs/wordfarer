/**
 * The site Worker, the front door (website spec §7.2): every request passes
 * the non-prod gate (#39) except the exempt paths, then `/play` and
 * `/play/*` go to the game Worker through the GAME service binding and
 * everything else to the site's own prerendered pages.
 *
 * `DEV_PASSWORD` is a Worker secret, uploaded by the deploy from the `dev`
 * environment secret (#357); when it is missing the gate fails closed.
 */
import { gateWebRequest } from '@yawelo-idle/lockdown';
import { EXEMPT_PATHS, isGamePath } from './routes';

interface GateEnv extends Env {
  /** A secret, so `wrangler types` cannot see it; absent means locked. */
  readonly DEV_PASSWORD?: string;
}

export default {
  fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (EXEMPT_PATHS.includes(pathname))
      return Promise.resolve(new Response('Not found', { status: 404 }));
    return gateWebRequest(request, env.DEV_PASSWORD, (allowed) =>
      isGamePath(new URL(allowed.url).pathname)
        ? env.GAME.fetch(allowed)
        : env.ASSETS.fetch(allowed),
    );
  },
} satisfies ExportedHandler<GateEnv>;
