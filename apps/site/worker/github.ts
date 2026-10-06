/**
 * The roadmap's read-only GitHub App, `yawelo-idle-roadmap` (#341, website
 * spec §5.2 item 3): a JWT signed with the App's key, an installation token
 * for the one repository, and every page of the board. The installation and
 * the issued token must each hold exactly the three reads, or nothing is read:
 * a public-facing Worker never holds a key that can write, and a write right
 * added to the App later turns dev verify red rather than going unnoticed.
 *
 * The same checks as `~/.claude/scripts/github-app/app_token.py`, which mints
 * the agent's tokens: an installation on selected repositories only, and the
 * issued rights compared with a pinned set.
 */
import { BOARD_QUERY } from '@yawelo-idle/progress';

const API = 'https://api.github.com';
/** GitHub refuses any request without a User-Agent. */
export const USER_AGENT = 'yawelo-idle-roadmap';
/** The App's rights: Issues, Metadata and the org's Projects, read only. */
export const PERMISSIONS: Readonly<Record<string, string>> = {
  issues: 'read',
  metadata: 'read',
  organization_projects: 'read',
};
/** 2,000 items at 100 a page: a board that claims more is broken, not big. */
const MAX_PAGES = 20;

/** Who reads, and for which repository. */
export interface App {
  appId: string;
  /** The private key as GitHub hands it out (PKCS#1 PEM) or as PKCS#8. */
  key: string;
  org: string;
  repoName: string;
}

const PEM =
  /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END \1?PRIVATE KEY-----/;

/** A DER length: short form below 128, else 0x80 + the byte count. */
function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);
  return [0x80 + bytes.length, ...bytes];
}

/**
 * PKCS#1 `RSAPrivateKey` wrapped as PKCS#8 `PrivateKeyInfo` (RFC 5208), the
 * only private-key form WebCrypto imports: version 0, the rsaEncryption
 * algorithm (OID 1.2.840.113549.1.1.1, NULL parameters), and the PKCS#1 key
 * as an OCTET STRING.
 */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00];
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01,
    0x01, 0x05, 0x00,
  ];
  const key = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const body = [...version, ...algorithm, ...key];
  return Uint8Array.from([0x30, ...derLength(body.length), ...body]);
}

/** The App's signing key, from either PEM form, whatever its line endings. */
export async function importAppKey(pem: string): Promise<CryptoKey> {
  const match = PEM.exec(pem);
  if (match === null)
    throw new Error('ROADMAP_APP_KEY is not a PEM private key');
  const der = Uint8Array.from(atob((match[2] ?? '').replace(/\s+/g, '')), (c) =>
    c.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    'pkcs8',
    match[1] === undefined ? der : pkcs1ToPkcs8(der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const encodeJson = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

/**
 * The App's JWT: GitHub accepts one for at most ten minutes, so it is issued
 * a minute back (for clock drift) and expires nine minutes ahead.
 */
export async function appJwt(
  appId: string,
  pem: string,
  nowSeconds: number,
): Promise<string> {
  const unsigned = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: appId,
  })}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await importAppKey(pem),
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** One REST call; any status but 2xx is refused, naming the call. */
async function call(
  method: 'GET' | 'POST',
  path: string,
  bearer: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok)
    throw new Error(
      `GitHub refused ${method} ${path}: HTTP ${String(response.status)}`,
    );
  return response.json();
}

/** Rights as one string, keys sorted, so two sets compare exactly. */
const canonical = (rights: unknown): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries((rights ?? {}) as Record<string, unknown>).sort(
        ([a], [b]) => a.localeCompare(b),
      ),
    ),
  );

/** An installation token for `app.repoName`, holding exactly the three reads. */
export async function installationToken(
  app: App,
  nowSeconds: number,
): Promise<string> {
  const jwt = await appJwt(app.appId, app.key, nowSeconds);
  const installation = (await call(
    'GET',
    `/orgs/${app.org}/installation`,
    jwt,
  )) as { id: number; repository_selection: string; permissions: unknown };
  if (installation.repository_selection !== 'selected')
    throw new Error(
      `the roadmap App is installed on every ${app.org} repository; install it on ${app.repoName} only`,
    );
  const pinned = canonical(PERMISSIONS);
  if (canonical(installation.permissions) !== pinned)
    throw new Error(
      `the roadmap App’s installation has ${canonical(installation.permissions)}, not exactly ${pinned}`,
    );
  const issued = (await call(
    'POST',
    `/app/installations/${String(installation.id)}/access_tokens`,
    jwt,
    { repositories: [app.repoName] },
  )) as {
    token: string;
    permissions: unknown;
    repositories?: { name: string }[];
  };
  if (canonical(issued.permissions) !== pinned)
    throw new Error(
      `the roadmap App’s token has ${canonical(issued.permissions)}, not exactly ${pinned}`,
    );
  const covered = JSON.stringify(
    (issued.repositories ?? []).map((r) => r.name),
  );
  if (covered !== JSON.stringify([app.repoName]))
    throw new Error(
      `the roadmap App’s token covers ${covered}, not ${JSON.stringify([app.repoName])}`,
    );
  return issued.token;
}

interface GraphQLPage {
  data?: {
    node?: {
      items?: { pageInfo?: { hasNextPage: boolean; endCursor: string | null } };
    } | null;
  };
  errors?: { message: string }[];
}

/**
 * Every page of the board as GitHub returns it for BOARD_QUERY, ready for
 * packages/progress. Refused by name: a failed request, an answer with
 * GraphQL errors, a board GitHub does not know, and one past MAX_PAGES.
 */
export async function readBoardPages(
  token: string,
  boardId: string,
): Promise<unknown[]> {
  const pages: unknown[] = [];
  let endCursor: string | null = null;
  for (let read = 0; read < MAX_PAGES; read += 1) {
    const page = (await call('POST', '/graphql', token, {
      query: BOARD_QUERY,
      variables: { id: boardId, endCursor },
    })) as GraphQLPage;
    const first = page.errors?.[0];
    if (first !== undefined)
      throw new Error(
        `GitHub’s GraphQL answered with errors: ${first.message}`,
      );
    const pageInfo = page.data?.node?.items?.pageInfo;
    if (pageInfo === undefined)
      throw new Error(`GitHub found no board ${boardId}`);
    pages.push(page);
    if (!pageInfo.hasNextPage) return pages;
    endCursor = pageInfo.endCursor;
  }
  throw new Error(
    `the board ${boardId} has more than ${String(MAX_PAGES)} pages`,
  );
}
