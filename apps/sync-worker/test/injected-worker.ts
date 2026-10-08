/**
 * TEST ONLY (#506), served by wrangler.injected.jsonc and never deployed.
 *
 * The real sync Worker, run inside workerd with one change to its
 * environment that no deploy has, named by the test in the `x-inject`
 * request header:
 *
 * - `commit=<sha>`: COMMIT is `<sha>`, as `--var COMMIT:<sha>` sets it;
 * - `d1-throws`: DB is a D1 whose `prepare` throws `INJECTED_CAUSE`.
 *
 * Any other value is refused with 400, so a mistyped case cannot pass on the
 * unchanged environment. Every `console.error` the Worker writes while it
 * answers comes back in the `x-console-error` header as JSON, one array of
 * arguments per call, the injected error written as `THE_CAUSE` only when it
 * is that very object.
 */
import worker from '../src/index';

const INJECTED_CAUSE = 'D1_ERROR: no such database';
const THE_CAUSE = '<the injected D1 error>';

function changed(env: Env, inject: string, cause: Error): Env | undefined {
  if (inject.startsWith('commit=')) {
    return { ...env, COMMIT: inject.slice('commit='.length) };
  }
  if (inject === 'd1-throws') {
    const broken = {
      prepare: () => {
        throw cause;
      },
    } as unknown as D1Database;
    return { ...env, DB: broken };
  }
  return undefined;
}

const written = (arg: unknown, cause: Error): unknown =>
  arg === cause
    ? THE_CAUSE
    : arg instanceof Error
      ? `${arg.name}: ${arg.message}`
      : arg;

export default {
  async fetch(request, env): Promise<Response> {
    const inject = request.headers.get('x-inject') ?? '';
    const cause = new Error(INJECTED_CAUSE);
    const injected = changed(env, inject, cause);
    if (injected === undefined) {
      return new Response(`unknown x-inject: ${inject}`, { status: 400 });
    }
    const logged: unknown[][] = [];
    const real = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map((arg) => written(arg, cause)));
    };
    let answer: Response;
    try {
      answer = await worker.fetch(request, injected);
    } finally {
      console.error = real;
    }
    const response = new Response(answer.body, answer);
    response.headers.set('x-console-error', JSON.stringify(logged));
    return response;
  },
} satisfies ExportedHandler<Env>;
