import { createVerify } from 'node:crypto';
import { BOARD_QUERY } from '../../../../packages/progress/src/index';
import { boardPages } from '../../../../packages/progress/test/board-fixture';
import {
  FAKE_APP_ID,
  FAKE_BOARD_ID,
  FAKE_INSTALLATION_ID,
  FAKE_ORG,
  FAKE_REPO_NAME,
  FAKE_TOKEN,
  READ_ONLY,
  type FakeConfig,
  type Seen,
} from './contract';

/**
 * A stand-in for api.github.com in the site Worker's workerd tests (#341),
 * installed as Miniflare's `outboundService`, so every `fetch` the Worker
 * makes lands here and nothing reaches GitHub. It holds the Worker to what
 * GitHub itself checks: an RS256 JWT verified with the App's public key
 * (`iat`, `exp` within ten minutes, `iss` the App id), a User-Agent on every
 * request, the token request naming the repository, and the GraphQL query
 * being packages/progress's BOARD_QUERY. It serves the shared board fixture
 * with real `pageInfo`, one page per request.
 *
 * Tests steer it and read what it saw through `https://fake-github.test/…`
 * (`POST /reset`, `POST /configure`, `GET /seen`), which the same outbound
 * route carries. The suite runs its files one at a time, so one state is
 * enough.
 */

const defaults = (): FakeConfig => ({
  repositorySelection: 'selected',
  installationPermissions: { ...READ_ONLY },
  tokenPermissions: { ...READ_ONLY },
  tokenRepositories: [FAKE_REPO_NAME],
  pages: null,
  graphqlStatus: 200,
  graphqlErrors: null,
  endlessPages: false,
});

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

function decode(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** The JWT's claims when GitHub would accept it, or why it would not. */
function verifyJwt(
  authorization: string | null,
  publicKey: string,
): { claims: NonNullable<Seen['claims']> } | { refused: string } {
  const jwt = /^Bearer (.+)$/.exec(authorization ?? '')?.[1];
  const parts = jwt?.split('.');
  if (parts?.length !== 3) return { refused: 'no Bearer JWT' };
  const [header, payload, signature] = parts as [string, string, string];
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  if (!verifier.verify(publicKey, Buffer.from(signature, 'base64url')))
    return { refused: 'bad signature' };
  const head = decode(header) as { alg?: string };
  if (head.alg !== 'RS256') return { refused: 'not RS256' };
  const claims = decode(payload) as { iat: number; exp: number; iss: string };
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== FAKE_APP_ID) return { refused: 'wrong iss' };
  if (claims.exp - claims.iat > 600) return { refused: 'longer than 10 min' };
  if (claims.exp <= now) return { refused: 'expired' };
  if (claims.iat > now + 60) return { refused: 'issued in the future' };
  return { claims };
}

/** The fixture page at `index`, with the `pageInfo` GitHub adds. */
function pageAt(pages: unknown[], index: number, endless: boolean): unknown {
  const page = structuredClone(pages[index]) as {
    data: { node: { items: Record<string, unknown> } };
  };
  page.data.node.items['pageInfo'] = {
    hasNextPage: endless || index < pages.length - 1,
    endCursor: String(index + 1),
  };
  return page;
}

/** The outbound handler and its state, for one test run. */
export function fakeGitHub(
  publicKey: string,
): (request: Request) => Promise<Response> {
  let config = defaults();
  let seen: Seen[] = [];

  return async (request) => {
    const url = new URL(request.url);
    if (url.hostname === 'fake-github.test') {
      if (url.pathname === '/reset') {
        config = defaults();
        seen = [];
        return json({ ok: true });
      }
      if (url.pathname === '/configure') {
        config = {
          ...config,
          ...((await request.json()) as Partial<FakeConfig>),
        };
        return json({ ok: true });
      }
      if (url.pathname === '/seen') return json(seen);
      return json({ message: 'no such control' }, 404);
    }

    const record: Seen = {
      method: request.method,
      url: request.url,
      userAgent: request.headers.get('User-Agent'),
    };
    seen.push(record);
    if (url.hostname !== 'api.github.com')
      return json(
        { message: `the fake serves api.github.com only, not ${url.hostname}` },
        502,
      );
    // GitHub refuses any request without a User-Agent.
    if (record.userAgent === null || record.userAgent === '')
      return json(
        { message: 'Request forbidden by administrative rules.' },
        403,
      );

    const app = `/orgs/${FAKE_ORG}/installation`;
    const tokens = `/app/installations/${String(FAKE_INSTALLATION_ID)}/access_tokens`;
    if (url.pathname === app || url.pathname === tokens) {
      const verdict = verifyJwt(
        request.headers.get('Authorization'),
        publicKey,
      );
      if ('refused' in verdict)
        return json(
          {
            message: `A JSON web token could not be decoded (${verdict.refused})`,
          },
          401,
        );
      record.claims = verdict.claims;
      if (url.pathname === app && request.method === 'GET')
        return json({
          id: FAKE_INSTALLATION_ID,
          repository_selection: config.repositorySelection,
          permissions: config.installationPermissions,
        });
      if (url.pathname === tokens && request.method === 'POST') {
        const body = (await request.json()) as { repositories?: unknown };
        if (
          JSON.stringify(body.repositories) !== JSON.stringify([FAKE_REPO_NAME])
        )
          return json(
            { message: 'the token request must name the one repository' },
            422,
          );
        return json(
          {
            token: FAKE_TOKEN,
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            permissions: config.tokenPermissions,
            repositories: config.tokenRepositories.map((name) => ({ name })),
          },
          201,
        );
      }
    }

    if (url.pathname === '/graphql' && request.method === 'POST') {
      if (request.headers.get('Authorization') !== `Bearer ${FAKE_TOKEN}`)
        return json({ message: 'Bad credentials' }, 401);
      const body = (await request.json()) as {
        query?: string;
        variables?: { id?: string; endCursor?: string | null };
      };
      record.cursor = body.variables?.endCursor ?? null;
      if (body.query !== BOARD_QUERY)
        return json({
          errors: [{ message: 'the fake answers BOARD_QUERY only' }],
        });
      if (body.variables?.id !== FAKE_BOARD_ID)
        return json({ data: { node: null } });
      if (config.graphqlStatus !== 200)
        return json({ message: 'Server Error' }, config.graphqlStatus);
      if (config.graphqlErrors !== null)
        return json({ errors: config.graphqlErrors });
      const pages =
        config.pages ?? boardPages(new Date().toISOString().slice(0, 10));
      const index = record.cursor === null ? 0 : Number(record.cursor);
      return json(
        pageAt(pages, config.endlessPages ? 0 : index, config.endlessPages),
      );
    }

    return json({ message: 'Not Found' }, 404);
  };
}
