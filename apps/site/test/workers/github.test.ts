import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseItems,
  roadmapItems,
} from '../../../../packages/progress/src/index';
import {
  boardPages,
  FIXTURE_REPO,
} from '../../../../packages/progress/test/board-fixture';
import {
  FAKE_APP_ID,
  FAKE_BOARD_ID,
  FAKE_ORG,
  FAKE_REPO_NAME,
  FAKE_TOKEN,
} from '../github-fake/contract';
import {
  appJwt,
  importAppKey,
  installationToken,
  readBoardPages,
  USER_AGENT,
  type App,
} from '../../worker/github';
import { configureFake, resetFake, seenByFake } from './fake';

/**
 * The roadmap's read-only GitHub App (#341, spec §5.2 item 3): a JWT signed
 * with the App's key, an installation token for the one repository whose
 * rights must be exactly the three reads, and every page of the board.
 * Everything goes to the fake GitHub (test/github-fake), which verifies the
 * JWT with the App's public key as GitHub would.
 */
const NOW = () => Math.floor(Date.now() / 1000);
const app = (over: Partial<App> = {}): App => ({
  appId: FAKE_APP_ID,
  key: env.ROADMAP_APP_KEY,
  org: FAKE_ORG,
  repoName: FAKE_REPO_NAME,
  ...over,
});

beforeEach(async () => {
  await resetFake();
});

describe('the App key and its JWT', () => {
  it('is accepted by GitHub when signed with the PKCS#1 key GitHub hands out', async () => {
    expect(env.ROADMAP_APP_KEY).toMatch(/^-----BEGIN RSA PRIVATE KEY-----\n/);
    expect(await installationToken(app(), NOW())).toBe(FAKE_TOKEN);
  });

  it('is accepted when the key is already PKCS#8', async () => {
    expect(env.TEST_APP_KEY_PKCS8).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(
      await installationToken(app({ key: env.TEST_APP_KEY_PKCS8 }), NOW()),
    ).toBe(FAKE_TOKEN);
  });

  it('is accepted when the key was pasted with Windows line endings', async () => {
    const crlf = env.ROADMAP_APP_KEY.replaceAll('\n', '\r\n');
    expect(crlf).toContain('\r\n');
    expect(await installationToken(app({ key: crlf }), NOW())).toBe(FAKE_TOKEN);
  });

  it('is accepted when the key was pasted with blank lines around it', async () => {
    expect(
      await installationToken(
        app({ key: `\n${env.ROADMAP_APP_KEY}\n\n` }),
        NOW(),
      ),
    ).toBe(FAKE_TOKEN);
  });

  it('carries iat a minute back and exp nine minutes ahead, inside GitHub’s ten', async () => {
    const jwt = await appJwt(FAKE_APP_ID, env.ROADMAP_APP_KEY, 1_000_000);
    const [header, payload] = jwt
      .split('.')
      .slice(0, 2)
      .map(
        (part) =>
          JSON.parse(
            atob(part.replaceAll('-', '+').replaceAll('_', '/')),
          ) as unknown,
      );
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload).toEqual({ iat: 999_940, exp: 1_000_540, iss: FAKE_APP_ID });
  });

  it('refuses a key that is not a PEM private key, by name', async () => {
    await expect(importAppKey('not a key')).rejects.toThrow(
      'ROADMAP_APP_KEY is not a PEM private key',
    );
  });
});

describe('installationToken', () => {
  it('sends its User-Agent on every request, which GitHub requires', async () => {
    await installationToken(app(), NOW());
    const seen = await seenByFake();
    expect(seen.map((s) => s.userAgent)).toEqual([USER_AGENT, USER_AGENT]);
  });

  it('refuses an installation on every repository of the org', async () => {
    await configureFake({ repositorySelection: 'all' });
    await expect(installationToken(app(), NOW())).rejects.toThrow(
      'the roadmap App is installed on every shyden-labs repository; install it on fixture only',
    );
  });

  it('refuses an installation that may write issues', async () => {
    await configureFake({
      installationPermissions: {
        issues: 'write',
        metadata: 'read',
        organization_projects: 'read',
      },
    });
    await expect(installationToken(app(), NOW())).rejects.toThrow(
      'the roadmap App’s installation has {"issues":"write","metadata":"read","organization_projects":"read"}, not exactly {"issues":"read","metadata":"read","organization_projects":"read"}',
    );
  });

  it('refuses an installation with a right beyond the three reads', async () => {
    await configureFake({
      installationPermissions: {
        contents: 'read',
        issues: 'read',
        metadata: 'read',
        organization_projects: 'read',
      },
    });
    await expect(installationToken(app(), NOW())).rejects.toThrow(
      'the roadmap App’s installation has {"contents":"read","issues":"read","metadata":"read","organization_projects":"read"}',
    );
  });

  it('refuses an installation without the Projects read', async () => {
    await configureFake({
      installationPermissions: { issues: 'read', metadata: 'read' },
    });
    await expect(installationToken(app(), NOW())).rejects.toThrow(
      'the roadmap App’s installation has {"issues":"read","metadata":"read"}',
    );
  });

  it('refuses an issued token whose rights differ from the three reads', async () => {
    await configureFake({
      tokenPermissions: {
        issues: 'read',
        metadata: 'read',
        organization_projects: 'write',
      },
    });
    await expect(installationToken(app(), NOW())).rejects.toThrow(
      'the roadmap App’s token has {"issues":"read","metadata":"read","organization_projects":"write"}',
    );
  });

  it('refuses an issued token that covers another repository', async () => {
    await configureFake({ tokenRepositories: ['fixture', 'other'] });
    await expect(installationToken(app(), NOW())).rejects.toThrow(
      'the roadmap App’s token covers ["fixture","other"], not ["fixture"]',
    );
  });

  it('names GitHub’s answer when GitHub refuses the JWT', async () => {
    await expect(installationToken(app({ appId: '1' }), NOW())).rejects.toThrow(
      'GitHub refused GET /orgs/shyden-labs/installation: HTTP 401',
    );
  });
});

describe('readBoardPages', () => {
  it('reads every page, following each endCursor', async () => {
    const pages = await readBoardPages(FAKE_TOKEN, FAKE_BOARD_ID);
    expect(pages).toHaveLength(2);
    const cursors = (await seenByFake()).map((s) => s.cursor);
    expect(cursors).toEqual([null, '1']);
  });

  it('gives pages the shared parser reads as the fixture', async () => {
    const pages = await readBoardPages(FAKE_TOKEN, FAKE_BOARD_ID);
    const today = new Date().toISOString().slice(0, 10);
    expect(roadmapItems(pages, FIXTURE_REPO).items).toEqual(
      parseItems(boardPages(today), FIXTURE_REPO),
    );
  });

  it('sends its User-Agent on every page', async () => {
    await readBoardPages(FAKE_TOKEN, FAKE_BOARD_ID);
    expect((await seenByFake()).map((s) => s.userAgent)).toEqual([
      USER_AGENT,
      USER_AGENT,
    ]);
  });

  it('refuses an answer carrying GraphQL errors, naming the first', async () => {
    await configureFake({
      graphqlErrors: [{ message: 'Something went wrong' }],
    });
    await expect(readBoardPages(FAKE_TOKEN, FAKE_BOARD_ID)).rejects.toThrow(
      'GitHub’s GraphQL answered with errors: Something went wrong',
    );
  });

  it('names the status of a failed GraphQL request', async () => {
    await configureFake({ graphqlStatus: 502 });
    await expect(readBoardPages(FAKE_TOKEN, FAKE_BOARD_ID)).rejects.toThrow(
      'GitHub refused POST /graphql: HTTP 502',
    );
  });

  it('refuses a board id GitHub does not know', async () => {
    await expect(readBoardPages(FAKE_TOKEN, 'PVT_other')).rejects.toThrow(
      'GitHub found no board PVT_other',
    );
  });

  it('stops at 20 pages rather than follow a board that never ends', async () => {
    await configureFake({ endlessPages: true });
    await expect(readBoardPages(FAKE_TOKEN, FAKE_BOARD_ID)).rejects.toThrow(
      'the board PVT_fixture has more than 20 pages',
    );
    expect(await seenByFake()).toHaveLength(20);
  });
});
