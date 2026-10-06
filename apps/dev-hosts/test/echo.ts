/**
 * A stand-in for a dev Worker in the adapter's harness tests: it answers
 * with everything that reached it, so a test can see whether the adapter
 * forwarded the request unchanged, and to which binding. `WHO` names the
 * binding it stands behind.
 */
interface EchoEnv {
  readonly WHO: string;
}

export default {
  async fetch(request: Request, env: EchoEnv): Promise<Response> {
    const url = new URL(request.url);
    return Response.json({
      who: env.WHO,
      method: request.method,
      host: url.host,
      pathname: url.pathname,
      search: url.search,
      probe: request.headers.get('x-probe'),
      body: await request.text(),
    });
  },
};
