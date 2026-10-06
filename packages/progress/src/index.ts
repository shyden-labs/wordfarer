/**
 * Progress from the project board, twice: by tickets and by effort (story
 * points in the board's `Estimate` field), each with its measured pace over
 * the last 7 days and the ETA that pace gives. Every session close-out
 * quotes these two lines, then adds what the pace cannot know: outside waits
 * (operator sign-offs, store review, devices) and any assumed change of pace.
 *
 * One home for this maths (website spec §5.2 item 7): scripts/board-progress.ts
 * prints the close-out lines from it, and the site Worker's roadmap (#341)
 * reads the same functions, so the two cannot disagree. Ported from
 * shyden-labs/repo-template's scripts/board-progress.ts (0a7829f) in #340,
 * which also fixed what that source let through: an empty scope, an Estimate
 * off the points scale, a story closed as not planned, a cut-off label list
 * and a day of floating-point error in the ETA.
 *
 * Pure functions over a board snapshot: no I/O and no clock (`today` is
 * passed in), so it runs in Node and in workerd alike.
 *
 * Left out of scope: epics (an epic is the sum of its stories), anything
 * labelled `post-launch` (not part of release-ready), and stories closed as
 * not planned or as duplicates (neither done nor left to do).
 */

export interface BoardItem {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  /** GitHub's reason for the state: null while an issue has never closed. */
  stateReason: 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null;
  createdAt: string;
  closedAt: string | null;
  estimate: number | null;
  labels: string[];
}

export interface TicketProgress {
  closed: number;
  total: number;
  epics: number;
  postLaunch: number;
  notPlanned: number;
  /**
   * Closures per UTC day over the 7 days ending today, oldest first; fewer
   * days while the board's oldest story is younger than that, because days
   * before the project existed are not working days.
   */
  pace: number[];
}

export type EffortProgress =
  | { available: false; scored: number; open: number }
  | {
      available: true;
      closedPoints: number;
      openPoints: number;
      /** Closed stories with no estimate, counted at the scored closed mean. */
      assumedClosed: number;
      scoredMean: number;
      /** Points closed per UTC day over the same window, oldest first. */
      pace: number[];
    };

export interface Progress {
  tickets: TicketProgress;
  effort: EffortProgress;
}

const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;
/** Story points (global rule, 2026-10-04): anything larger is an epic to split. */
const POINTS = [1, 2, 3, 5, 8, 13];

const isEpic = (item: BoardItem): boolean => /^Epic\b/.test(item.title);
const isPostLaunch = (item: BoardItem): boolean =>
  item.labels.includes('post-launch');
const isNotPlanned = (item: BoardItem): boolean =>
  item.state === 'CLOSED' &&
  (item.stateReason === 'NOT_PLANNED' || item.stateReason === 'DUPLICATE');

/** Whether a board item counts towards release-ready. */
export function inScope(item: BoardItem): boolean {
  return !isEpic(item) && !isPostLaunch(item) && !isNotPlanned(item);
}

/** The UTC days of the window ending `today`, oldest first, none before `since`. */
function windowDays(today: string, since: string): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: WINDOW_DAYS }, (_, i) =>
    new Date(end - (WINDOW_DAYS - 1 - i) * DAY_MS).toISOString().slice(0, 10),
  ).filter((day) => day >= since);
}

function perDay(
  closed: BoardItem[],
  days: string[],
  weight: (item: BoardItem) => number,
): number[] {
  return days.map((day) =>
    closed
      .filter((item) => item.closedAt?.slice(0, 10) === day)
      .reduce((sum, item) => sum + weight(item), 0),
  );
}

export function progress(items: BoardItem[], today: string): Progress {
  const scope = items.filter(inScope);
  if (scope.length === 0) {
    throw new Error('the board has no in-scope stories: nothing to measure');
  }
  for (const item of scope) {
    if (item.estimate !== null && !POINTS.includes(item.estimate)) {
      throw new Error(
        `#${String(item.number)} has Estimate ${String(item.estimate)}: a story is 1, 2, 3, 5, 8 or 13 points, and anything larger is an epic to split`,
      );
    }
  }
  const closed = scope.filter((item) => item.state === 'CLOSED');
  const open = scope.filter((item) => item.state === 'OPEN');
  // `since` is never after `today`, so the window always holds today.
  const since = items
    .map((item) => item.createdAt.slice(0, 10))
    .reduce((a, b) => (b < a ? b : a), today);
  const days = windowDays(today, since);
  const tickets: TicketProgress = {
    closed: closed.length,
    total: scope.length,
    epics: items.filter(isEpic).length,
    postLaunch: items.filter((item) => !isEpic(item) && isPostLaunch(item))
      .length,
    notPlanned: items.filter(
      (item) => !isEpic(item) && !isPostLaunch(item) && isNotPlanned(item),
    ).length,
    pace: perDay(closed, days, () => 1),
  };
  const scoredOpen = open.filter((item) => item.estimate !== null);
  if (scoredOpen.length < open.length) {
    return {
      tickets,
      effort: {
        available: false,
        scored: scoredOpen.length,
        open: open.length,
      },
    };
  }
  const scoredClosed = closed.filter((item) => item.estimate !== null);
  const scoredMean =
    scoredClosed.length === 0
      ? 0
      : scoredClosed.reduce((sum, item) => sum + (item.estimate ?? 0), 0) /
        scoredClosed.length;
  const points = (item: BoardItem): number => item.estimate ?? scoredMean;
  return {
    tickets,
    effort: {
      available: true,
      closedPoints: closed.reduce((sum, item) => sum + points(item), 0),
      openPoints: open.reduce((sum, item) => sum + points(item), 0),
      assumedClosed: closed.length - scoredClosed.length,
      scoredMean,
      pace: perDay(closed, days, points),
    },
  };
}

const plural = (n: number, word: string): string =>
  `${String(n)} ${word}${n === 1 ? '' : 's'}`;

const sumOf = (pace: number[]): number => pace.reduce((a, b) => a + b, 0);

/** The ETA at the window's mean daily pace, or why there is none. */
function eta(remaining: number, pace: number[], today: string): string {
  const closed = sumOf(pace);
  if (closed === 0) {
    return `ETA at that pace: none, nothing closed in the last ${plural(pace.length, 'day')}.`;
  }
  // remaining ÷ (closed ÷ days) as one division: dividing by the rounded mean
  // put a whole number of days a hair above itself, and its ceiling a day late.
  const days = Math.ceil((remaining * pace.length) / closed);
  const date = new Date(Date.parse(`${today}T00:00:00Z`) + days * DAY_MS);
  return `ETA at that pace: ${date.toISOString().slice(0, 10)}, before outside waits.`;
}

/** The two close-out lines: by tickets, then by effort. */
export function formatLines(p: Progress, today: string): [string, string] {
  const t = p.tickets;
  const leftOut =
    t.notPlanned === 0
      ? `${plural(t.epics, 'epic')} and ${String(t.postLaunch)} post-launch`
      : `${plural(t.epics, 'epic')}, ${String(t.postLaunch)} post-launch and ${String(t.notPlanned)} closed as not planned`;
  const tickets =
    `By tickets: ${String(Math.round((100 * t.closed) / t.total))}% complete ` +
    `(${String(t.closed)} of ${String(t.total)} in-scope stories closed; ${leftOut} left out). ` +
    `Measured pace ${(sumOf(t.pace) / t.pace.length).toFixed(2)} a day over the last ${plural(t.pace.length, 'day')} (${t.pace.join(', ')}). ` +
    eta(t.total - t.closed, t.pace, today);
  const e = p.effort;
  if (!e.available) {
    return [
      tickets,
      `By effort: unavailable, ${String(e.scored)} of ${String(e.open)} open tickets scored`,
    ];
  }
  const total = e.closedPoints + e.openPoints;
  const assumed =
    e.assumedClosed === 0
      ? ''
      : `; ${plural(e.assumedClosed, 'closed story')} unscored, counted at the scored mean of ${e.scoredMean.toFixed(1)} points (assumed)`;
  const effort =
    `By effort: ${String(Math.round((100 * e.closedPoints) / total))}% complete ` +
    `(${String(Math.round(e.closedPoints))} of ${String(Math.round(total))} points closed${assumed}). ` +
    `Measured pace ${(sumOf(e.pace) / e.pace.length).toFixed(2)} points a day over the last ${plural(e.pace.length, 'day')} ` +
    `(${e.pace.map((n) => String(Math.round(n))).join(', ')}). ` +
    eta(e.openPoints, e.pace, today);
  return [tickets, effort];
}

const LABELS_PER_ISSUE = 20;
/** Every item of a board with what the maths reads, 100 to a page. */
export const BOARD_QUERY = `query($id: ID!, $endCursor: String) {
  node(id: $id) { ... on ProjectV2 { title
    items(first: 100, after: $endCursor) { pageInfo { hasNextPage endCursor }
      nodes {
        estimate: fieldValueByName(name: "Estimate") { ... on ProjectV2ItemFieldNumberValue { number } }
        content { __typename
          ... on DraftIssue { title }
          ... on PullRequest { title }
          ... on Issue { number title state stateReason createdAt closedAt
            repository { nameWithOwner }
            labels(first: ${String(LABELS_PER_ISSUE)}) { totalCount nodes { name } } }
        } } } } } }`;

interface RawNode {
  estimate: { number: number } | null;
  content: {
    __typename: string;
    title?: string;
    number?: number;
    state?: 'OPEN' | 'CLOSED';
    stateReason?: BoardItem['stateReason'];
    createdAt?: string;
    closedAt?: string | null;
    labels?: { totalCount: number; nodes: { name: string }[] };
    repository?: { nameWithOwner: string };
  } | null;
}
interface RawPage {
  data: { node: { title: string; items: { nodes: RawNode[] } } };
}

/** A page as it may come back: a wrong node id gives `node: null` or `{}`. */
interface UncheckedPage {
  data?: { node?: { items?: { nodes?: unknown } } | null };
}

/** A page's board, refused by name when the page holds none. */
function boardOf(page: unknown): RawPage['data']['node'] {
  const board = (page as UncheckedPage | null)?.data?.node;
  if (board?.items === undefined || !Array.isArray(board.items.nodes)) {
    throw new Error(
      'a page came back without the board’s items: is the node id a project board?',
    );
  }
  return board as RawPage['data']['node'];
}

/** A board item the roadmap leaves off (#341), by kind, with what it is called. */
export interface Dropped {
  kind: 'draft' | 'pull request' | 'another repository';
  label: string;
}

/** Why an item is not one of `repo`'s issues: the message `parseItems` refuses it with. */
type NotAnIssue = Dropped & { refusal: string };

const notAnIssue = (title: string, kind: 'draft item' | 'item'): string =>
  `${kind} "${title}" is not an issue: convert it, or remove it from the board`;

/**
 * One reading of a board item for both policies (#341): one of `repo`'s
 * issues, or something the close-out script refuses and the roadmap drops.
 * Anything else (no content, a kind GitHub may add, a malformed issue) is
 * refused by name here, under either policy.
 */
function classify(node: RawNode, repo: string): BoardItem | NotAnIssue {
  const c = node.content;
  if (c?.__typename === 'DraftIssue') {
    const title = c.title ?? '';
    return {
      kind: 'draft',
      label: title,
      refusal: notAnIssue(title, 'draft item'),
    };
  }
  if (c?.__typename === 'PullRequest') {
    const title = c.title ?? '';
    return {
      kind: 'pull request',
      label: title,
      refusal: notAnIssue(title, 'item'),
    };
  }
  if (c?.__typename !== 'Issue') {
    throw new Error(notAnIssue(c?.title ?? '(no content)', 'item'));
  }
  if (
    c.number === undefined ||
    c.title === undefined ||
    c.state === undefined ||
    c.createdAt === undefined
  ) {
    throw new Error(
      'an issue on the board came back without its number, title, state or creation time',
    );
  }
  if (c.repository === undefined) {
    throw new Error(`#${String(c.number)} came back without its repository`);
  }
  const owner = c.repository.nameWithOwner;
  if (owner !== repo) {
    return {
      kind: 'another repository',
      label: `${owner}#${String(c.number)} ${c.title}`,
      refusal: `#${String(c.number)} is an issue of ${owner}, not ${repo}: remove it from the board`,
    };
  }
  const labels = c.labels ?? { totalCount: 0, nodes: [] };
  if (labels.totalCount > labels.nodes.length) {
    throw new Error(
      `#${String(c.number)} has ${String(labels.totalCount)} labels and ${String(labels.nodes.length)} were read: raise labels(first:) in BOARD_QUERY`,
    );
  }
  return {
    number: c.number,
    title: c.title,
    state: c.state,
    stateReason: c.stateReason ?? null,
    createdAt: c.createdAt,
    closedAt: c.closedAt ?? null,
    estimate: node.estimate?.number ?? null,
    labels: labels.nodes.map((l) => l.name),
  };
}

const isIssue = (read: BoardItem | NotAnIssue): read is BoardItem =>
  !('refusal' in read);

/**
 * `repo`'s issues on the board, for the close-out script: anything else is
 * refused by name, so the operator fixes the board rather than reading a
 * count that quietly left something out.
 */
export function parseItems(pages: unknown[], repo: string): BoardItem[] {
  return pages.flatMap((page) =>
    boardOf(page).items.nodes.map((node) => {
      const read = classify(node, repo);
      if (isIssue(read)) return read;
      throw new Error(read.refusal);
    }),
  );
}

/**
 * `repo`'s issues on the board, for the public roadmap (#341): drafts, pull
 * requests and other repositories' issues are left off and listed, so one
 * stray card never takes the page down; anything unclassifiable is still
 * refused by name. On a board `parseItems` accepts, both give the same items.
 */
export function roadmapItems(
  pages: unknown[],
  repo: string,
): { items: BoardItem[]; dropped: Dropped[] } {
  const items: BoardItem[] = [];
  const dropped: Dropped[] = [];
  for (const page of pages) {
    for (const node of boardOf(page).items.nodes) {
      const read = classify(node, repo);
      if (isIssue(read)) items.push(read);
      else dropped.push({ kind: read.kind, label: read.label });
    }
  }
  return { items, dropped };
}

/** Refuse to read a board other than the one asked for. */
export function assertTitle(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `the board is "${actual}", not "${expected}": nothing read`,
    );
  }
}

/**
 * The two close-out lines from the pages `gh api graphql --paginate --slurp`
 * returns for BOARD_QUERY, with every page's board title asserted first.
 */
export function closeOutLines(
  pages: unknown[],
  title: string,
  repo: string,
  today: string,
): [string, string] {
  for (const page of pages) assertTitle(boardOf(page).title, title);
  return formatLines(progress(parseItems(pages, repo), today), today);
}
