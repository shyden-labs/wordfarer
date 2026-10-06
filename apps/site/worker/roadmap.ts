/**
 * The `Roadmap` Durable Object (#341, website spec §5.2 items 3–6): the one
 * snapshot of the board the public roadmap shows, its version, and the
 * health of the two ways it learns of changes.
 *
 * - An accepted webhook (`changed`) means only "something changed": reads are
 *   coalesced, so any burst costs at most two, the last of which saw every
 *   event.
 * - The scheduled check (`check`, every 10 minutes) reads the whole board on
 *   its own. A difference no event explains is drift, made loud by
 *   `/api/roadmap/health` and dev verify; it is an independent reading of the
 *   source of truth, not a retry.
 * - A failed read keeps the last snapshot and says since when reads fail.
 *   Nothing reads again by itself: the next event or check is the next read.
 *
 * Each new version goes to every open page over hibernating WebSockets.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  assertBoard,
  formatLines,
  progress,
  roadmapItems,
  type BoardItem,
  type Dropped,
  type Progress,
} from '@yawelo-idle/progress';
import { installationToken, readBoardPages } from './github';

/** A late webhook is believed for this long after the check that saw its change. */
export const GRACE_MS = 120_000;
/** Drift is reported for a day, then only counted in `driftTotal`. */
export const DRIFT_WINDOW_MS = 86_400_000;

/** The App's id and key, which `wrangler types` cannot see; the board's vars it can. */
export interface RoadmapEnv extends Env {
  readonly ROADMAP_APP_ID?: string;
  readonly ROADMAP_APP_KEY?: string;
}

/** What `/api/roadmap.json` serves and each socket receives. */
export interface Snapshot {
  version: number;
  readAt: string;
  /** SHA-256 of the items: the only thing that makes a new version. */
  hash: string;
  items: BoardItem[];
  dropped: Dropped[];
  progress: Progress;
  lines: [string, string];
}

/** What `/api/roadmap/health` serves. */
export interface Health {
  lastEventAt: string | null;
  lastCheckAt: string | null;
  version: number;
  /** Unexplained differences in the last day. */
  drift: number;
  driftTotal: number;
  pendingDriftSince: string | null;
  readFailingSince: string | null;
  readError: string | null;
}

interface State {
  snapshot: Snapshot | null;
  /** When the read behind the current snapshot (or its last confirmation) began. */
  lastReadStartedAt: number | null;
  lastEventAt: number | null;
  lastCheckAt: number | null;
  pendingDriftSince: number | null;
  driftAt: number[];
  driftTotal: number;
  readFailingSince: number | null;
  readError: string | null;
}

const EMPTY: State = {
  snapshot: null,
  lastReadStartedAt: null,
  lastEventAt: null,
  lastCheckAt: null,
  pendingDriftSince: null,
  driftAt: [],
  driftTotal: 0,
  readFailingSince: null,
  readError: null,
};

const iso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString();

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export class Roadmap extends DurableObject<RoadmapEnv> {
  private state: State = { ...EMPTY };
  /** Set by an event while a read runs: one more read follows it. */
  private dirty = false;
  /** The running read loop, if any. */
  private draining: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: RoadmapEnv) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<State>('state')) ?? { ...EMPTY };
    });
  }

  /** The clock; a test replaces it to move time. */
  now(): number {
    return Date.now();
  }

  /** An accepted webhook: something on the board changed. */
  async changed(): Promise<void> {
    const now = this.now();
    this.promoteStalePending(now);
    const pending = this.state.pendingDriftSince;
    if (pending !== null && now - pending <= GRACE_MS)
      this.state.pendingDriftSince = null;
    this.state.lastEventAt = now;
    await this.save();
    this.dirty = true;
    await this.drain();
  }

  /** The scheduled check: an independent read of the whole board. */
  async check(): Promise<void> {
    if (this.draining !== null) await this.draining;
    const now = this.now();
    this.promoteStalePending(now);
    this.state.lastCheckAt = now;
    await this.read('check');
  }

  async health(): Promise<Health> {
    if (this.state.lastCheckAt === null) await this.check();
    const now = this.now();
    this.promoteStalePending(now);
    await this.save();
    const s = this.state;
    return {
      lastEventAt: iso(s.lastEventAt),
      lastCheckAt: iso(s.lastCheckAt),
      version: s.snapshot?.version ?? 0,
      drift: s.driftAt.filter((at) => now - at < DRIFT_WINDOW_MS).length,
      driftTotal: s.driftTotal,
      pendingDriftSince: iso(s.pendingDriftSince),
      readFailingSince: iso(s.readFailingSince),
      readError: s.readError,
    };
  }

  async snapshot(): Promise<Snapshot | null> {
    if (this.state.lastCheckAt === null) await this.check();
    return this.state.snapshot;
  }

  /** `/api/roadmap/live`: a hibernating socket that gets every version. */
  override fetch(request: Request): Response {
    if (request.headers.get('Upgrade') !== 'websocket')
      return new Response('expected a WebSocket upgrade', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair()) as [
      WebSocket,
      WebSocket,
    ];
    this.ctx.acceptWebSocket(server);
    if (this.state.snapshot !== null)
      server.send(JSON.stringify(this.state.snapshot));
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    ws.close(code, reason);
  }

  /** Reads until no event arrived during the last read. */
  private drain(): Promise<void> {
    this.draining ??= (async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          await this.read('event');
        }
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  private async read(source: 'event' | 'check'): Promise<void> {
    const startedAt = this.now();
    const env = this.env;
    try {
      if (env.ROADMAP_APP_ID === undefined || env.ROADMAP_APP_KEY === undefined)
        throw new Error('ROADMAP_APP_ID and ROADMAP_APP_KEY must both be set');
      const [owner = '', name = ''] = env.ROADMAP_REPO.split('/');
      const token = await installationToken(
        {
          appId: env.ROADMAP_APP_ID,
          key: env.ROADMAP_APP_KEY,
          org: owner,
          repoName: name,
        },
        // GitHub judges the JWT by the wall clock, never by `now()`.
        Math.floor(Date.now() / 1000),
      );
      const pages = await readBoardPages(token, env.ROADMAP_BOARD_ID);
      assertBoard(pages, env.ROADMAP_BOARD_TITLE);
      const { items, dropped } = roadmapItems(pages, env.ROADMAP_REPO);
      const sorted = [...items].sort((a, b) => a.number - b.number);
      const hash = await sha256(JSON.stringify(sorted));
      const previous = this.state.snapshot;
      if (previous?.hash !== hash) {
        const today = new Date(startedAt).toISOString().slice(0, 10);
        const measured = progress(sorted, today);
        const unexplained =
          source === 'check' &&
          previous !== null &&
          !(
            this.state.lastEventAt !== null &&
            this.state.lastReadStartedAt !== null &&
            this.state.lastEventAt >= this.state.lastReadStartedAt
          );
        this.state.snapshot = {
          version: (previous?.version ?? 0) + 1,
          readAt: new Date(startedAt).toISOString(),
          hash,
          items: sorted,
          dropped,
          progress: measured,
          lines: formatLines(measured, today),
        };
        if (unexplained) this.state.pendingDriftSince ??= startedAt;
        this.broadcast();
      }
      this.state.lastReadStartedAt = startedAt;
      this.state.readFailingSince = null;
      this.state.readError = null;
    } catch (error) {
      this.state.readFailingSince ??= startedAt;
      this.state.readError =
        error instanceof Error ? error.message : String(error);
    }
    await this.save();
  }

  /** A pending difference no late webhook explained within the grace is drift. */
  private promoteStalePending(now: number): void {
    const pending = this.state.pendingDriftSince;
    if (pending === null || now - pending <= GRACE_MS) return;
    this.state.driftAt = [
      ...this.state.driftAt.filter((at) => now - at < DRIFT_WINDOW_MS),
      pending,
    ];
    this.state.driftTotal += 1;
    this.state.pendingDriftSince = null;
  }

  private broadcast(): void {
    const message = JSON.stringify(this.state.snapshot);
    // A runtime population: the sockets open at this moment.
    for (const socket of this.ctx.getWebSockets()) socket.send(message);
  }

  private save(): Promise<void> {
    return this.ctx.storage.put('state', this.state);
  }
}
