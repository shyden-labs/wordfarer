import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { FIXTURE_REPO } from '../../../../packages/progress/test/board-fixture';
import { FAKE_BOARD_ID } from '../github-fake/contract';
import worker from '../../worker/index';
import { resetFake, seenByFake } from './fake';

/**
 * The site Worker's roadmap routes (#341): the webhook's door at
 * `/hooks/github` (outside the dev password, guarded by its signature), the
 * three `/api/roadmap*` paths behind the password (R6, measured 2026-10-06:
 * every engine sends cached Basic credentials on the socket upgrade), and the
 * cron. Called as the runtime calls the Worker, with a dev hostname so the
 * gate applies.
 */
const HOST = 'https://yawelo-idle-site-dev.shyden-labs-dev.workers.dev';
const AUTH = { Authorization: `Basic ${btoa('tester:test-only-password')}` };

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    // The runtime's incoming request type; a test request carries no `cf`.
    new Request(`${HOST}${path}`, init) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}

async function sign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ROADMAP_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );
  return `sha256=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function deliver(event: string, payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return call('/hooks/github', {
    method: 'POST',
    body,
    headers: {
      'X-GitHub-Event': event,
      'X-Hub-Signature-256': signature ?? (await sign(body)),
      'Content-Type': 'application/json',
    },
  });
}

const boardReads = async () =>
  (await seenByFake()).filter(
    (s) => s.url.endsWith('/graphql') && s.cursor === null,
  ).length;

beforeEach(async () => {
  await resetFake();
});

describe('/hooks/github', () => {
  it('accepts a signed issue event from the board’s repository and reads the board', async () => {
    const response = await deliver('issues', {
      repository: { full_name: FIXTURE_REPO },
    });
    expect(response.status).toBe(202);
    expect(await boardReads()).toBe(1);
  });

  it('accepts a signed item event on the board and reads it', async () => {
    const response = await deliver('projects_v2_item', {
      projects_v2_item: { project_node_id: FAKE_BOARD_ID },
    });
    expect(response.status).toBe(202);
    expect(await boardReads()).toBe(1);
  });

  it('answers a signed ping without reading', async () => {
    const response = await deliver('ping', { zen: 'Design for failure.' });
    expect(response.status).toBe(204);
    expect(await boardReads()).toBe(0);
  });

  it('answers a signed event from another board without reading', async () => {
    const response = await deliver('projects_v2_item', {
      projects_v2_item: { project_node_id: 'PVT_shytalk' },
    });
    expect(response.status).toBe(204);
    expect(await boardReads()).toBe(0);
  });

  it('refuses an unsigned delivery with 401 and no detail', async () => {
    const response = await call('/hooks/github', {
      method: 'POST',
      body: '{}',
      headers: { 'X-GitHub-Event': 'issues' },
    });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(await boardReads()).toBe(0);
  });

  it('refuses a delivery signed with another secret', async () => {
    const response = await deliver(
      'issues',
      { repository: { full_name: FIXTURE_REPO } },
      `sha256=${'0'.repeat(64)}`,
    );
    expect(response.status).toBe(401);
    expect(await boardReads()).toBe(0);
  });

  it('refuses a signed body that is not JSON', async () => {
    const body = 'not json';
    const response = await call('/hooks/github', {
      method: 'POST',
      body,
      headers: {
        'X-GitHub-Event': 'issues',
        'X-Hub-Signature-256': await sign(body),
      },
    });
    expect(response.status).toBe(400);
  });

  it('refuses a body over 1 MiB before checking its signature', async () => {
    const response = await call('/hooks/github', {
      method: 'POST',
      body: 'x'.repeat(1_048_577),
      headers: {
        'X-GitHub-Event': 'issues',
        'X-Hub-Signature-256': `sha256=${'0'.repeat(64)}`,
      },
    });
    expect(response.status).toBe(413);
  });

  it('refuses any method but POST, naming POST', async () => {
    const response = await call('/hooks/github');
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});

describe('/api/roadmap*', () => {
  it('keeps the roadmap behind the dev password', async () => {
    expect((await call('/api/roadmap.json')).status).toBe(401);
  });

  it('serves the snapshot as JSON, never cached', async () => {
    const response = await call('/api/roadmap.json', { headers: AUTH });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const snapshot = await response.json<{
      version: number;
      lines: string[];
    }>();
    expect(snapshot.version).toBeGreaterThanOrEqual(1);
    expect(snapshot.lines).toHaveLength(2);
  });

  it('serves the health as JSON, never cached', async () => {
    const response = await call('/api/roadmap/health', { headers: AUTH });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      drift: 0,
      readFailingSince: null,
    });
  });

  it('upgrades the live path to a WebSocket behind the password', async () => {
    const response = await call('/api/roadmap/live', {
      headers: { ...AUTH, Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);
    response.webSocket?.accept();
    response.webSocket?.close(1000, 'done');
  });
});

describe('the cron', () => {
  it('reads the whole board on its schedule', async () => {
    const ctx = createExecutionContext();
    worker.scheduled(
      createScheduledController({ cron: '*/10 * * * *' }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(await boardReads()).toBe(1);
  });
});
