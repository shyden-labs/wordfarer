/**
 * The dev web Worker: every request passes the non-prod gate (#39) before the
 * static assets are served. `DEV_PASSWORD` is a Worker secret, set by Shyden
 * with `wrangler secret put`; when it is missing the gate fails closed.
 */
import { gateWebRequest } from '@yawelo-idle/lockdown';

interface GateEnv extends Env {
  /** A secret, so `wrangler types` cannot see it; absent means locked. */
  readonly DEV_PASSWORD?: string;
}

export default {
  fetch(request, env): Promise<Response> {
    return gateWebRequest(request, env.DEV_PASSWORD, (allowed) =>
      env.ASSETS.fetch(allowed),
    );
  },
} satisfies ExportedHandler<GateEnv>;
