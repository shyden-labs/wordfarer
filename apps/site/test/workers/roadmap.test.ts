import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { closeOutLines } from '../../../../packages/progress/src/index';
import {
  boardPages,
  FIXTURE_REPO,
  FIXTURE_TITLE,
} from '../../../../packages/progress/test/board-fixture';
import {
  DRIFT_WINDOW_MS,
  GRACE_MS,
  type Roadmap,
  type Snapshot,
} from '../../worker/roadmap';
import { configureFake, resetFake, seenByFake } from './fake';

/**
 * The `Roadmap` Durable Object (#341, spec §5.2 items 3–6), driven directly
 * with its clock replaced, against the fake GitHub serving the shared board
 * fixture. Storage is isolated per test file, not per test, so each test
 * takes a Durable Object of its own.
 */
const today = () => new Date().toISOString().slice(0, 10);
// The virtual clock starts at the real time, so "today" is the fake's today;
// GitHub's JWT runs on the wall clock regardless (worker/roadmap.ts).
const T0 = Date.now();

let count = 0;
const fresh = () =>
  env.ROADMAP.getByName(`roadmap-test-${String((count += 1))}`);

/** Runs `body` inside a fresh Durable Object whose clock reads `at()`. */
async function inRoadmap<T>(
  body: (roadmap: Roadmap, clock: { at: number }) => Promise<T>,
  stub = fresh(),
): Promise<T> {
  return runInDurableObject(stub, async (roadmap: Roadmap) => {
    const clock = { at: T0 };
    roadmap.now = () => clock.at;
    return body(roadmap, clock);
  });
}

/** The fixture board with one more story, so it hashes differently. */
function boardWithExtraStory(): unknown[] {
  const pages = boardPages(today()) as {
    data: {
      node: {
        items: { nodes: { content: { number: number; title: string } }[] };
      };
    };
  }[];
  const last = pages.at(-1)?.data.node.items.nodes;
  const template = last?.at(-1);
  if (last === undefined || template === undefined)
    throw new Error('the fixture has no story to copy');
  last.push({
    ...structuredClone(template),
    content: {
      ...structuredClone(template.content),
      number: 99,
      title: 'Story ninety-nine',
    },
  });
  return pages;
}

/** GraphQL first-page reads the fake has served: one per board read. */
const boardReads = async () =>
  (await seenByFake()).filter(
    (s) => s.url.endsWith('/graphql') && s.cursor === null,
  ).length;

beforeEach(async () => {
  await resetFake();
});

describe('reading the board', () => {
  it('reads the board on the first health request, as version 1', async () => {
    const health = await inRoadmap((r) => r.health());
    expect(health.version).toBe(1);
    expect(health.lastCheckAt).toBe(new Date(T0).toISOString());
    expect(health.readFailingSince).toBeNull();
  });

  it('gives the same two lines as the close-out script, from one fixture', async () => {
    const snapshot = await inRoadmap((r) => r.snapshot());
    expect(snapshot?.lines).toEqual(
      closeOutLines(boardPages(today()), FIXTURE_TITLE, FIXTURE_REPO, today()),
    );
  });

  it('keeps the version when a read finds the same board', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      clock.at += 600_000;
      await r.check();
      return r.health();
    });
    expect(health.version).toBe(1);
  });

  it('raises the version when an event finds the board changed', async () => {
    const snapshot = await inRoadmap(async (r) => {
      await r.check();
      await configureFake({ pages: boardWithExtraStory() });
      await r.changed();
      return r.snapshot();
    });
    expect(snapshot?.version).toBe(2);
    expect(snapshot?.items.map((i) => i.number)).toContain(99);
  });

  it('coalesces a burst of ten events into at most two reads, ending on the last board', async () => {
    const { reads, snapshot } = await inRoadmap(async (r) => {
      await r.check();
      const before = await boardReads();
      await configureFake({ pages: boardWithExtraStory() });
      await Promise.all(Array.from({ length: 10 }, () => r.changed()));
      return {
        reads: (await boardReads()) - before,
        snapshot: await r.snapshot(),
      };
    });
    expect(reads).toBeGreaterThanOrEqual(1);
    expect(reads).toBeLessThanOrEqual(2);
    expect(snapshot?.items.map((i) => i.number)).toContain(99);
  });

  it('drops a draft from the snapshot and lists it', async () => {
    const pages = boardPages(today()) as {
      data: { node: { items: { nodes: unknown[] } } };
    }[];
    pages[0]?.data.node.items.nodes.push({
      estimate: null,
      content: { __typename: 'DraftIssue', title: 'An idea' },
    });
    await configureFake({ pages });
    const snapshot = await inRoadmap((r) => r.snapshot());
    expect(snapshot?.dropped).toEqual([{ kind: 'draft', label: 'An idea' }]);
  });

  it('refuses a board with another title, keeping nothing from it', async () => {
    const pages = boardPages(today()) as {
      data: { node: { title: string } };
    }[];
    for (const page of pages) page.data.node.title = 'ShyTalk Stories';
    await configureFake({ pages });
    const health = await inRoadmap((r) => r.health());
    expect(health.version).toBe(0);
    expect(health.readError).toBe(
      'the board is "ShyTalk Stories", not "Fixture Stories": nothing read',
    );
  });
});

describe('a failed read', () => {
  it('keeps the snapshot and records since when reads fail, and why', async () => {
    const { health, snapshot } = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ graphqlStatus: 502, pages: boardWithExtraStory() });
      clock.at += 60_000;
      await r.changed();
      return { health: await r.health(), snapshot: await r.snapshot() };
    });
    expect(snapshot?.version).toBe(1);
    expect(health.readFailingSince).toBe(new Date(T0 + 60_000).toISOString());
    expect(health.readError).toBe('GitHub refused POST /graphql: HTTP 502');
  });

  it('keeps the first failure’s time while reads go on failing', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ graphqlStatus: 502 });
      clock.at += 60_000;
      await r.changed();
      clock.at += 60_000;
      await r.changed();
      return r.health();
    });
    expect(health.readFailingSince).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('clears the failure on the next good read', async () => {
    const health = await inRoadmap(async (r) => {
      await r.check();
      await configureFake({ graphqlStatus: 502 });
      await r.changed();
      await configureFake({ graphqlStatus: 200 });
      await r.changed();
      return r.health();
    });
    expect(health.readFailingSince).toBeNull();
    expect(health.readError).toBeNull();
  });

  it('reads once for a failed event, never again by itself', async () => {
    const reads = await inRoadmap(async (r) => {
      await r.check();
      await configureFake({ graphqlStatus: 502 });
      const before = await boardReads();
      await r.changed();
      return (await boardReads()) - before;
    });
    expect(reads).toBe(1);
  });
});

describe('drift', () => {
  it('counts a difference the check found with no event, once the grace has passed', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ pages: boardWithExtraStory() });
      clock.at += 600_000;
      await r.check();
      const pending = await r.health();
      expect(pending.pendingDriftSince).toBe(new Date(clock.at).toISOString());
      expect(pending.drift).toBe(0);
      clock.at += GRACE_MS + 1;
      return r.health();
    });
    expect(health.drift).toBe(1);
    expect(health.driftTotal).toBe(1);
    expect(health.pendingDriftSince).toBeNull();
  });

  it('counts no drift when the late webhook arrives within the grace', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ pages: boardWithExtraStory() });
      clock.at += 600_000;
      await r.check();
      clock.at += GRACE_MS;
      await r.changed();
      clock.at += GRACE_MS + 1;
      return r.health();
    });
    expect(health.drift).toBe(0);
    expect(health.driftTotal).toBe(0);
  });

  it('counts drift when the webhook comes only after the grace', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ pages: boardWithExtraStory() });
      clock.at += 600_000;
      await r.check();
      clock.at += GRACE_MS + 1;
      await r.changed();
      return r.health();
    });
    expect(health.drift).toBe(1);
  });

  it('counts no drift when an event came after the last good read began, its own read having failed', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ graphqlStatus: 502, pages: boardWithExtraStory() });
      clock.at += 60_000;
      await r.changed();
      await configureFake({ graphqlStatus: 200 });
      clock.at += 600_000;
      await r.check();
      clock.at += GRACE_MS + 1;
      return r.health();
    });
    expect(health.version).toBe(2);
    expect(health.drift).toBe(0);
    expect(health.pendingDriftSince).toBeNull();
  });

  it('counts no drift when the check finds the board it already has', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      clock.at += 600_000;
      await r.check();
      clock.at += GRACE_MS + 1;
      return r.health();
    });
    expect(health.drift).toBe(0);
    expect(health.pendingDriftSince).toBeNull();
  });

  it('reports drift for a day, then only in driftTotal', async () => {
    const health = await inRoadmap(async (r, clock) => {
      await r.check();
      await configureFake({ pages: boardWithExtraStory() });
      clock.at += 600_000;
      await r.check();
      const found = clock.at;
      clock.at = found + GRACE_MS + 1;
      expect((await r.health()).drift).toBe(1);
      clock.at = found + DRIFT_WINDOW_MS;
      return r.health();
    });
    expect(health.drift).toBe(0);
    expect(health.driftTotal).toBe(1);
  });
});

describe('the live socket', () => {
  /** Opens a socket on `stub` and collects what it receives. */
  async function open(stub: ReturnType<typeof fresh>) {
    const response = await stub.fetch('https://roadmap/api/roadmap/live', {
      headers: { Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (socket === null) throw new Error('no socket in the 101');
    socket.accept();
    const received: Snapshot[] = [];
    const waiters: (() => void)[] = [];
    socket.addEventListener('message', (event) => {
      received.push(JSON.parse(String(event.data)) as Snapshot);
      waiters.shift()?.();
    });
    const next = (): Promise<Snapshot> =>
      new Promise((resolve) => {
        const have = received.shift();
        if (have !== undefined) resolve(have);
        else
          waiters.push(() => {
            resolve(received.shift() as Snapshot);
          });
      });
    return { next };
  }

  it('sends the snapshot on connect, then each new version', async () => {
    const stub = fresh();
    await inRoadmap((r) => r.check(), stub);
    const socket = await open(stub);
    expect((await socket.next()).version).toBe(1);
    await configureFake({ pages: boardWithExtraStory() });
    await inRoadmap((r) => r.changed(), stub);
    expect((await socket.next()).version).toBe(2);
  });

  it('refuses a request that is not a WebSocket upgrade', async () => {
    const response = await fresh().fetch('https://roadmap/api/roadmap/live');
    expect(response.status).toBe(426);
  });
});
