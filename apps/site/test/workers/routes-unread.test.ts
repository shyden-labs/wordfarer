import {
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import worker from '../../worker/index';
import { configureFake, resetFake } from './fake';

/**
 * `/api/roadmap.json` before any read has succeeded (#341). A file of its
 * own, because storage is isolated per file: here the Durable Object starts
 * with no snapshot at all.
 */
it('answers 503 with the reason when the board has never been read', async () => {
  await resetFake();
  await configureFake({ graphqlStatus: 502 });
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(
      'https://yawelo-idle-site-dev.shyden-labs-dev.workers.dev/api/roadmap.json',
      {
        headers: {
          Authorization: `Basic ${btoa('tester:test-only-password')}`,
        },
      },
    ),
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: 'GitHub refused POST /graphql: HTTP 502',
  });
});
