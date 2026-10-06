/**
 * A board as `gh api graphql --paginate --slurp` returns it for BOARD_QUERY:
 * two pages of raw GraphQL, with every kind of item the maths treats
 * differently. Dates are relative to `today`, so the pace window holds the
 * same closures whatever day a test runs. One fixture for every reader of
 * packages/progress: the module's own tests, the wrapper script's (#340) and
 * the Worker's (#341), so they can be held to identical output.
 */
export const FIXTURE_TITLE = 'Fixture Stories';
/** The repository whose issues the fixture's board holds (#341). */
export const FIXTURE_REPO = 'shyden-labs/fixture';

const DAY_MS = 86_400_000;

function daysBefore(today: string, days: number): string {
  return new Date(Date.parse(`${today}T12:00:00Z`) - days * DAY_MS)
    .toISOString()
    .replace('.000', '');
}

interface Story {
  number: number;
  title: string;
  estimate: number | null;
  labels?: string[];
  /** Days before `today` it closed; absent while open. */
  closed?: number;
  stateReason?: 'COMPLETED' | 'NOT_PLANNED';
}

function node(today: string, story: Story): unknown {
  const labels = story.labels ?? [];
  return {
    estimate: story.estimate === null ? null : { number: story.estimate },
    content: {
      __typename: 'Issue',
      number: story.number,
      title: story.title,
      state: story.closed === undefined ? 'OPEN' : 'CLOSED',
      stateReason:
        story.closed === undefined ? null : (story.stateReason ?? 'COMPLETED'),
      createdAt: daysBefore(today, 30),
      closedAt:
        story.closed === undefined ? null : daysBefore(today, story.closed),
      labels: {
        totalCount: labels.length,
        nodes: labels.map((name) => ({ name })),
      },
      repository: { nameWithOwner: FIXTURE_REPO },
    },
  };
}

function page(today: string, stories: Story[]): unknown {
  return {
    data: {
      node: {
        title: FIXTURE_TITLE,
        items: { nodes: stories.map((story) => node(today, story)) },
      },
    },
  };
}

export function boardPages(today: string): unknown[] {
  return [
    page(today, [
      { number: 1, title: 'Epic M1: Core', estimate: null },
      { number: 2, title: 'Story two', estimate: 5, closed: 1 },
      { number: 3, title: 'Story three', estimate: 3, closed: 3 },
      { number: 4, title: 'Story four', estimate: null, closed: 20 },
      { number: 5, title: 'Story five', estimate: 8 },
    ]),
    page(today, [
      { number: 6, title: 'Story six', estimate: 13 },
      {
        number: 7,
        title: 'Story seven',
        estimate: 2,
        labels: ['post-launch'],
      },
      {
        number: 8,
        title: 'Story eight',
        estimate: 3,
        closed: 0,
        stateReason: 'NOT_PLANNED',
      },
      { number: 9, title: 'Story nine', estimate: 3 },
    ]),
  ];
}
