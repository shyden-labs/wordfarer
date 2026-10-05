import { describe, it, expect, vi } from 'vitest';
import { env, exports } from 'cloudflare:workers';
import worker from '../src/index';

const call = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`https://sync.test${path}`, init));

describe('GET /health', () => {
  it('reports ok, the commit and a D1 that answers', async () => {
    const response = await call('/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      ok: true,
      commit: 'local',
      db: 'ok',
    });
  });

  it('reports the commit it was deployed with', async () => {
    const sha = 'd547bd669678987eb85b5807d1a26ea55eaeb987';
    const response = await worker.fetch(
      new Request('https://sync.test/health'),
      { ...env, COMMIT: sha },
    );
    expect(await response.json()).toMatchObject({ commit: sha });
  });

  it('answers 503, not 200, when D1 throws', async () => {
    const broken = {
      prepare: () => {
        throw new Error('D1_ERROR: no such database');
      },
    } as unknown as D1Database;
    const response = await worker.fetch(
      new Request('https://sync.test/health'),
      { ...env, DB: broken },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      commit: 'local',
      db: 'unreachable',
    });
  });

  it('logs why D1 failed, so a 503 can be diagnosed from the Worker logs', async () => {
    const cause = new Error('D1_ERROR: no such database');
    const broken = {
      prepare: () => {
        throw cause;
      },
    } as unknown as D1Database;
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await worker.fetch(new Request('https://sync.test/health'), {
        ...env,
        DB: broken,
      });
      expect(logged).toHaveBeenCalledWith('health: D1 query failed', cause);
    } finally {
      logged.mockRestore();
    }
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])(
    'refuses %s, naming GET as the one method it allows',
    async (method) => {
      const response = await call('/health', { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow'), method).toBe('GET');
    },
  );

  it.each(['/', '/healthz', '/health/', '/HEALTH', '/health/extra'])(
    'answers 404 for %s',
    async (path) => {
      const response = await call(path);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found' });
    },
  );
});

describe('non-prod marking (#39)', () => {
  const host = (origin: string, path: string) =>
    exports.default.fetch(new Request(`${origin}${path}`));

  it.each(['/health', '/missing'])(
    'marks %s noindex on the dev API host, with no password asked',
    async (path) => {
      const response = await host(
        'https://dev-api.yawelo-idle.shyden.co.uk',
        path,
      );
      expect(response.status).not.toBe(401);
      expect(response.headers.get('x-robots-tag')).toBe(
        'noindex, nofollow, noarchive',
      );
    },
  );

  it('serves blocking robots.txt on the dev API host', async () => {
    const response = await host(
      'https://dev-api.yawelo-idle.shyden.co.uk',
      '/robots.txt',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('User-agent: *\nDisallow: /\n');
  });

  it('leaves the production API host unmarked, robots.txt included', async () => {
    const health = await host(
      'https://api.yawelo-idle.shyden.co.uk',
      '/health',
    );
    expect(health.status).toBe(200);
    expect(health.headers.get('x-robots-tag')).toBeNull();
    const robots = await host(
      'https://api.yawelo-idle.shyden.co.uk',
      '/robots.txt',
    );
    expect(robots.status).toBe(404);
    expect(robots.headers.get('x-robots-tag')).toBeNull();
  });
});
