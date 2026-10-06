/**
 * The site Worker, the front door (website spec §7.2): every request passes
 * the non-prod gate (#39) except `/hooks/github`, then `/play` and `/play/*`
 * go to the game Worker through the GAME service binding, `/api/roadmap*` to
 * the `Roadmap` Durable Object (#341), and everything else to the site's own
 * prerendered pages. The cron reads the board every 10 minutes.
 *
 * `DEV_PASSWORD`, `ROADMAP_WEBHOOK_SECRET` and `ROADMAP_APP_KEY` are Worker
 * secrets, uploaded by the deploy from the `dev` environment's secrets (#357,
 * #341); a missing password locks the gate and a missing webhook secret
 * refuses every delivery.
 */
import { gateWebRequest } from '@yawelo-idle/lockdown';
import { Roadmap, type RoadmapEnv } from './roadmap';
import { HOOK_PATH, isGamePath, isRoadmapPath, ROADMAP_PATHS } from './routes';
import { classifyEvent, verifySignature } from './webhook';

export { Roadmap };

interface SiteEnv extends RoadmapEnv {
  /** Secrets, so `wrangler types` cannot see them; absent means refused. */
  readonly DEV_PASSWORD?: string;
  readonly ROADMAP_WEBHOOK_SECRET?: string;
}

/** GitHub's issue payloads are tens of kilobytes; nothing it sends nears this. */
const MAX_HOOK_BYTES = 1_048_576;

const roadmap = (env: SiteEnv) => env.ROADMAP.getByName('board');

const noStore = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** `/hooks/github`: signature first, then only this board's events cause a read. */
async function hook(
  request: Request,
  env: SiteEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MAX_HOOK_BYTES) return new Response(null, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_HOOK_BYTES)
    return new Response(null, { status: 413 });
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!(await verifySignature(env.ROADMAP_WEBHOOK_SECRET, body, signature)))
    return new Response(null, { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  const verdict = classifyEvent(
    request.headers.get('X-GitHub-Event') ?? '',
    payload,
    { id: env.ROADMAP_BOARD_ID, repo: env.ROADMAP_REPO },
  );
  if (verdict !== 'read') return new Response(null, { status: 204 });
  ctx.waitUntil(roadmap(env).changed());
  return new Response(null, { status: 202 });
}

/** The three roadmap paths, once the gate has let the request through. */
async function api(request: Request, env: SiteEnv): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === ROADMAP_PATHS.live) return roadmap(env).fetch(request);
  if (pathname === ROADMAP_PATHS.health)
    return noStore(await roadmap(env).health());
  const snapshot = await roadmap(env).snapshot();
  if (snapshot !== null) return noStore(snapshot);
  const { readError } = await roadmap(env).health();
  return noStore({ error: readError }, 503);
}

export default {
  fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === HOOK_PATH) return hook(request, env, ctx);
    return gateWebRequest(request, env.DEV_PASSWORD, (allowed) => {
      const path = new URL(allowed.url).pathname;
      if (isGamePath(path)) return env.GAME.fetch(allowed);
      if (isRoadmapPath(path)) return api(allowed, env);
      return env.ASSETS.fetch(allowed);
    });
  },
  scheduled(_controller, env, ctx): void {
    ctx.waitUntil(roadmap(env).check());
  },
} satisfies ExportedHandler<SiteEnv>;
