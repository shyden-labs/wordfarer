import { describe, expect, it } from 'vitest';
import {
  assertBoard,
  assertTitle,
  BOARD_QUERY,
  closeOutLines,
  formatLines,
  inScope,
  parseItems,
  progress,
  roadmapItems,
  type BoardItem,
} from '../src/index';
import { boardPages, FIXTURE_REPO, FIXTURE_TITLE } from './board-fixture';

/**
 * Progress from the board, never from feel: every session close-out states
 * the project's % complete and an ETA twice, by tickets and by story points
 * (the `Estimate` field). These tests pin how both are counted. 21 of them,
 * under their original titles, are ported from shyden-labs/repo-template's
 * tests/unit/board-progress.test.ts (0a7829f); two of its fixtures used an
 * Estimate of 4, which is off the points scale and now refused, so they use 8
 * and 5. The rest pin the defects #340 fixed in the port.
 */

const TODAY = '2026-10-04';

function item(over: Partial<BoardItem> & { number: number }): BoardItem {
  return {
    title: `Story ${String(over.number)}`,
    state: 'OPEN',
    stateReason: null,
    createdAt: '2026-09-01T00:00:00Z',
    closedAt: null,
    estimate: 3,
    labels: [],
    ...over,
  };
}

const closedOn = (number: number, day: string, estimate: number | null = 3) =>
  item({
    number,
    state: 'CLOSED',
    stateReason: 'COMPLETED',
    closedAt: `${day}T12:00:00Z`,
    estimate,
  });

describe('inScope', () => {
  it('leaves out an epic, which is the sum of its stories', () => {
    expect(inScope(item({ number: 1, title: 'Epic M1: Core' }))).toBe(false);
  });

  it('leaves out a post-launch story', () => {
    expect(inScope(item({ number: 2, labels: ['post-launch'] }))).toBe(false);
  });

  it('keeps an ordinary story', () => {
    expect(inScope(item({ number: 3 }))).toBe(true);
  });

  it('leaves out a story closed as not planned, which is neither done nor left to do', () => {
    expect(
      inScope({ ...closedOn(4, '2026-10-03'), stateReason: 'NOT_PLANNED' }),
    ).toBe(false);
  });

  it('leaves out a story closed as a duplicate', () => {
    expect(
      inScope({ ...closedOn(5, '2026-10-03'), stateReason: 'DUPLICATE' }),
    ).toBe(false);
  });

  it('keeps a story closed as completed', () => {
    expect(inScope(closedOn(6, '2026-10-03'))).toBe(true);
  });
});

describe('progress by tickets', () => {
  it('counts closed of all in-scope stories', () => {
    const p = progress(
      [
        closedOn(1, '2026-10-03'),
        item({ number: 2 }),
        item({ number: 3 }),
        item({ number: 4, title: 'Epic M2' }),
      ],
      TODAY,
    );
    expect(p.tickets).toMatchObject({ closed: 1, total: 3 });
  });

  it('counts closures per UTC day over the 7 days ending today, oldest first', () => {
    const p = progress(
      [
        closedOn(1, '2026-09-28'),
        closedOn(2, '2026-10-03'),
        closedOn(3, '2026-10-03'),
        closedOn(4, '2026-10-04'),
      ],
      TODAY,
    );
    expect(p.tickets.pace).toEqual([1, 0, 0, 0, 0, 2, 1]);
  });

  it('starts the window at the board’s oldest story when that is younger than 7 days', () => {
    const p = progress(
      [
        { ...closedOn(1, '2026-10-03'), createdAt: '2026-10-02T08:00:00Z' },
        item({ number: 2, createdAt: '2026-10-02T09:00:00Z' }),
        item({ number: 3, createdAt: '2026-10-03T09:00:00Z' }),
      ],
      TODAY,
    );
    expect(p.tickets.pace).toEqual([0, 1, 0]);
  });

  it('leaves a closure 7 days before today out of the window', () => {
    const p = progress([closedOn(1, '2026-09-27')], TODAY);
    expect(p.tickets.pace).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('leaves a story closed as not planned out of the counts and the pace, and counts it', () => {
    const p = progress(
      [
        closedOn(1, '2026-10-04'),
        { ...closedOn(2, '2026-10-04'), stateReason: 'NOT_PLANNED' },
        item({ number: 3 }),
      ],
      TODAY,
    );
    expect(p.tickets).toMatchObject({
      closed: 1,
      total: 2,
      notPlanned: 1,
      pace: [0, 0, 0, 0, 0, 0, 1],
    });
  });

  it('refuses a board with no in-scope story, which has nothing to measure', () => {
    expect(() =>
      progress([item({ number: 1, title: 'Epic M1: Core' })], TODAY),
    ).toThrow('the board has no in-scope stories: nothing to measure');
  });
});

describe('progress by effort', () => {
  it('is unavailable while an open in-scope story has no estimate', () => {
    const p = progress(
      [item({ number: 1 }), item({ number: 2, estimate: null })],
      TODAY,
    );
    expect(p.effort).toEqual({ available: false, scored: 1, open: 2 });
  });

  it('counts closed points of all points', () => {
    const p = progress(
      [closedOn(1, '2026-10-03', 5), item({ number: 2, estimate: 8 })],
      TODAY,
    );
    expect(p.effort).toMatchObject({
      available: true,
      closedPoints: 5,
      openPoints: 8,
      assumedClosed: 0,
    });
  });

  it('counts an unscored closed story at the scored closed mean, as assumed', () => {
    const p = progress(
      [
        closedOn(1, '2026-10-03', 2),
        closedOn(2, '2026-10-03', 8),
        closedOn(3, '2026-09-01', null),
        item({ number: 4, estimate: 5 }),
      ],
      TODAY,
    );
    expect(p.effort).toMatchObject({ closedPoints: 15, assumedClosed: 1 });
  });

  it('ignores an epic’s own estimate', () => {
    const p = progress(
      [
        item({ number: 1, estimate: 5 }),
        item({ number: 2, title: 'Epic X', estimate: 40 }),
      ],
      TODAY,
    );
    expect(p.effort).toMatchObject({ openPoints: 5 });
  });

  it('counts points closed per day over the same window', () => {
    const p = progress(
      [closedOn(1, '2026-10-03', 5), closedOn(2, '2026-10-04', 8)],
      TODAY,
    );
    expect(p.effort).toMatchObject({ pace: [0, 0, 0, 0, 0, 5, 8] });
  });

  for (const estimate of [0, 4, 21, 2.5])
    it(`refuses an in-scope Estimate of ${String(estimate)}, which is off the points scale`, () => {
      expect(() =>
        progress([item({ number: 7 }), item({ number: 8, estimate })], TODAY),
      ).toThrow(
        `#8 has Estimate ${String(estimate)}: a story is 1, 2, 3, 5, 8 or 13 points, and anything larger is an epic to split`,
      );
    });

  it('does not judge the estimate of a story out of scope', () => {
    const p = progress(
      [
        item({ number: 1, estimate: 5 }),
        item({ number: 2, labels: ['post-launch'], estimate: 4 }),
      ],
      TODAY,
    );
    expect(p.effort).toMatchObject({ openPoints: 5 });
  });
});

describe('formatLines', () => {
  const sample = (): BoardItem[] => [
    closedOn(1, '2026-10-03', 5),
    closedOn(2, '2026-10-04', 2),
    item({ number: 3, estimate: 8 }),
    item({ number: 4, estimate: 13 }),
    item({ number: 5, title: 'Epic M1' }),
    item({ number: 6, labels: ['post-launch'] }),
  ];

  it('states tickets complete, the measured pace and the ETA at that pace', () => {
    expect(formatLines(progress(sample(), TODAY), TODAY)[0]).toBe(
      'By tickets: 50% complete (2 of 4 in-scope stories closed; 1 epic and 1 post-launch left out). ' +
        'Measured pace 0.29 a day over the last 7 days (0, 0, 0, 0, 0, 1, 1). ' +
        'ETA at that pace: 2026-10-11, before outside waits.',
    );
  });

  it('states effort complete, the measured pace and the ETA at that pace', () => {
    expect(formatLines(progress(sample(), TODAY), TODAY)[1]).toBe(
      'By effort: 25% complete (7 of 28 points closed). ' +
        'Measured pace 1.00 points a day over the last 7 days (0, 0, 0, 0, 0, 5, 2). ' +
        'ETA at that pace: 2026-10-25, before outside waits.',
    );
  });

  it('names the assumed points of unscored closed stories', () => {
    const lines = formatLines(
      progress(
        [
          closedOn(1, '2026-10-03', 5),
          closedOn(2, '2026-08-01', null),
          item({ number: 3, estimate: 8 }),
        ],
        TODAY,
      ),
      TODAY,
    );
    expect(lines[1]).toContain(
      '1 closed story unscored, counted at the scored mean of 5.0 points (assumed)',
    );
  });

  it('says effort is unavailable, with the count scored, before the backfill', () => {
    expect(
      formatLines(
        progress(
          [item({ number: 1, estimate: null }), item({ number: 2 })],
          TODAY,
        ),
        TODAY,
      )[1],
    ).toBe('By effort: unavailable, 1 of 2 open tickets scored');
  });

  it('gives no date when nothing closed in the window', () => {
    expect(
      formatLines(progress([item({ number: 1 })], TODAY), TODAY)[0],
    ).toContain('ETA at that pace: none, nothing closed in the last 7 days.');
  });

  it('names stories closed as not planned among those left out, when there are any', () => {
    const items = [
      ...sample(),
      { ...closedOn(7, '2026-10-04'), stateReason: 'NOT_PLANNED' as const },
    ];
    expect(formatLines(progress(items, TODAY), TODAY)[0]).toContain(
      '(2 of 4 in-scope stories closed; 1 epic, 1 post-launch and 1 closed as not planned left out). ',
    );
  });

  it('gives today as the ETA when nothing remains', () => {
    expect(
      formatLines(progress([closedOn(1, TODAY)], TODAY), TODAY)[0],
    ).toContain(
      '100% complete (1 of 1 in-scope stories closed; 0 epics and 0 post-launch left out). ' +
        'Measured pace 0.14 a day over the last 7 days (0, 0, 0, 0, 0, 0, 1). ' +
        'ETA at that pace: 2026-10-04, before outside waits.',
    );
  });

  it('counts the ETA in whole days without a floating-point extra day', () => {
    // 17 closed over 7 days is 17/7 a day, so 17 open take exactly 7 days;
    // 17 / (17 / 7) is 7.000000000000001 in floating point, and its ceiling
    // was a day late (measured: 117 of 420,000 small cases).
    const closed = Array.from({ length: 17 }, (_, i) =>
      closedOn(i + 1, '2026-10-04'),
    );
    const open = Array.from({ length: 17 }, (_, i) => item({ number: i + 18 }));
    expect(
      formatLines(progress([...closed, ...open], TODAY), TODAY)[0],
    ).toContain('ETA at that pace: 2026-10-11, before outside waits.');
  });
});

const REPO = 'shyden-labs/example';
const page = (nodes: unknown[]) => ({
  data: { node: { title: 'Example Stories', items: { nodes } } },
});
const issue = (over: Record<string, unknown> = {}) => ({
  __typename: 'Issue',
  number: 8,
  title: 'Story',
  state: 'OPEN',
  stateReason: null,
  createdAt: '2026-10-01T00:00:00Z',
  closedAt: null,
  labels: { totalCount: 0, nodes: [] },
  repository: { nameWithOwner: REPO },
  ...over,
});

describe('parseItems', () => {
  const parse = (pages: unknown[]) => parseItems(pages, REPO);

  it('reads an issue with its Estimate, state, close time and labels', () => {
    expect(
      parse([
        page([
          {
            estimate: { number: 5 },
            content: issue({
              number: 7,
              state: 'CLOSED',
              stateReason: 'COMPLETED',
              closedAt: '2026-10-03T01:02:03Z',
              labels: { totalCount: 1, nodes: [{ name: 'post-launch' }] },
            }),
          },
        ]),
      ]),
    ).toEqual([
      {
        number: 7,
        title: 'Story',
        state: 'CLOSED',
        stateReason: 'COMPLETED',
        createdAt: '2026-10-01T00:00:00Z',
        closedAt: '2026-10-03T01:02:03Z',
        estimate: 5,
        labels: ['post-launch'],
      },
    ]);
  });

  it('reads an unset Estimate as null', () => {
    const [read] = parse([page([{ estimate: null, content: issue() }])]);
    expect(read?.estimate).toBeNull();
  });

  it('reads an open issue’s state reason as null', () => {
    const [read] = parse([page([{ estimate: null, content: issue() }])]);
    expect(read?.stateReason).toBeNull();
  });

  it('refuses a draft item by name, never skipping it', () => {
    expect(() =>
      parse([
        page([
          {
            estimate: null,
            content: { __typename: 'DraftIssue', title: 'Idea' },
          },
        ]),
      ]),
    ).toThrow(
      'draft item "Idea" is not an issue: convert it, or remove it from the board',
    );
  });

  it('refuses a pull request by name', () => {
    expect(() =>
      parse([
        page([
          {
            estimate: null,
            content: { __typename: 'PullRequest', title: 'Fix' },
          },
        ]),
      ]),
    ).toThrow(
      'item "Fix" is not an issue: convert it, or remove it from the board',
    );
  });

  it('refuses an item whose content cannot be read, such as a deleted issue', () => {
    expect(() => parse([page([{ estimate: null, content: null }])])).toThrow(
      'item "(no content)" is not an issue: convert it, or remove it from the board',
    );
  });

  it('refuses an issue that came back without its creation time', () => {
    expect(() =>
      parse([
        page([{ estimate: null, content: issue({ createdAt: undefined }) }]),
      ]),
    ).toThrow(
      'an issue on the board came back without its number, title, state or creation time',
    );
  });

  it('refuses an issue whose labels were cut off at the page size, which could hide post-launch', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      name: `label-${String(i)}`,
    }));
    expect(() =>
      parse([
        page([
          {
            estimate: null,
            content: issue({ labels: { totalCount: 21, nodes } }),
          },
        ]),
      ]),
    ).toThrow(
      '#8 has 21 labels and 20 were read: raise labels(first:) in BOARD_QUERY',
    );
  });

  it('refuses a page that holds no board items', () => {
    expect(() => parse([{ data: { node: null } }])).toThrow(
      'a page came back without the board’s items: is the node id a project board?',
    );
  });

  it('refuses another repository’s issue by name (#341)', () => {
    expect(() =>
      parse([
        page([
          {
            estimate: null,
            content: issue({
              repository: { nameWithOwner: 'shyden-labs/other' },
            }),
          },
        ]),
      ]),
    ).toThrow(
      '#8 is an issue of shyden-labs/other, not shyden-labs/example: remove it from the board',
    );
  });

  it('refuses an issue that came back without its repository (#341)', () => {
    expect(() =>
      parse([
        page([{ estimate: null, content: issue({ repository: undefined }) }]),
      ]),
    ).toThrow('#8 came back without its repository');
  });

  it('reads every page', () => {
    expect(
      parse([
        page([{ estimate: null, content: issue({ number: 1 }) }]),
        page([
          { estimate: null, content: issue({ number: 2 }) },
          { estimate: null, content: issue({ number: 3 }) },
        ]),
      ]).map((i) => i.number),
    ).toEqual([1, 2, 3]);
  });
});

describe('roadmapItems (#341)', () => {
  const read = (nodes: unknown[]) => roadmapItems([page(nodes)], REPO);

  it('keeps the repository’s issues exactly as parseItems reads them', () => {
    const pages = boardPages(TODAY);
    expect(roadmapItems(pages, FIXTURE_REPO)).toEqual({
      items: parseItems(pages, FIXTURE_REPO),
      dropped: [],
    });
  });

  it('drops a draft item, naming it', () => {
    expect(
      read([
        {
          estimate: null,
          content: { __typename: 'DraftIssue', title: 'Idea' },
        },
      ]),
    ).toEqual({ items: [], dropped: [{ kind: 'draft', label: 'Idea' }] });
  });

  it('drops a pull request, naming it', () => {
    expect(
      read([
        {
          estimate: null,
          content: { __typename: 'PullRequest', title: 'Fix' },
        },
      ]),
    ).toEqual({ items: [], dropped: [{ kind: 'pull request', label: 'Fix' }] });
  });

  it('drops another repository’s issue, naming it with its repository', () => {
    expect(
      read([
        {
          estimate: null,
          content: issue({
            repository: { nameWithOwner: 'shyden-labs/other' },
          }),
        },
      ]),
    ).toEqual({
      items: [],
      dropped: [
        { kind: 'another repository', label: 'shyden-labs/other#8 Story' },
      ],
    });
  });

  it('keeps an issue beside the items it drops', () => {
    const { items, dropped } = read([
      { estimate: null, content: { __typename: 'DraftIssue', title: 'Idea' } },
      { estimate: 3, content: issue({ number: 9 }) },
    ]);
    expect(items.map((i) => i.number)).toEqual([9]);
    expect(dropped).toEqual([{ kind: 'draft', label: 'Idea' }]);
  });

  it('refuses an item whose content cannot be read, such as a deleted issue', () => {
    expect(() => read([{ estimate: null, content: null }])).toThrow(
      'item "(no content)" is not an issue: convert it, or remove it from the board',
    );
  });

  it('refuses a kind of item it does not know, by name', () => {
    expect(() =>
      read([
        { estimate: null, content: { __typename: 'Mystery', title: 'Odd' } },
      ]),
    ).toThrow(
      'item "Odd" is not an issue: convert it, or remove it from the board',
    );
  });

  it('refuses an issue that came back without its creation time', () => {
    expect(() =>
      read([{ estimate: null, content: issue({ createdAt: undefined }) }]),
    ).toThrow(
      'an issue on the board came back without its number, title, state or creation time',
    );
  });

  it('refuses an issue that came back without its repository', () => {
    expect(() =>
      read([{ estimate: null, content: issue({ repository: undefined }) }]),
    ).toThrow('#8 came back without its repository');
  });

  it('refuses a page that holds no board items', () => {
    expect(() => roadmapItems([{ data: { node: null } }], REPO)).toThrow(
      'a page came back without the board’s items: is the node id a project board?',
    );
  });

  it('reads every page', () => {
    expect(
      roadmapItems(
        [
          page([{ estimate: null, content: issue({ number: 1 }) }]),
          page([{ estimate: null, content: issue({ number: 2 }) }]),
        ],
        REPO,
      ).items.map((i) => i.number),
    ).toEqual([1, 2]);
  });
});

describe('BOARD_QUERY', () => {
  // Every field the parser reads (#341). The fixtures hand these over
  // whatever the query asks, so only this pins that GitHub is asked for them.
  const FIELDS = [
    'title',
    'estimate',
    '__typename',
    'number',
    'state',
    'stateReason',
    'createdAt',
    'closedAt',
    'repository',
    'nameWithOwner',
    'labels',
    'totalCount',
    'name',
    'endCursor',
    'hasNextPage',
  ];
  for (const field of FIELDS) {
    it(`asks GitHub for ${field}`, () => {
      expect(BOARD_QUERY).toMatch(new RegExp(`\\b${field}\\b`));
    });
  }
});

describe('assertTitle', () => {
  it('passes the board it was asked for', () => {
    expect(() => {
      assertTitle('Example Stories', 'Example Stories');
    }).not.toThrow();
  });

  it('refuses any other board by name', () => {
    expect(() => {
      assertTitle('ShyTalk Stories', 'Example Stories');
    }).toThrow(
      'the board is "ShyTalk Stories", not "Example Stories": nothing read',
    );
  });
});

describe('assertBoard (#341)', () => {
  it('passes every page of the board it was asked for', () => {
    expect(() => {
      assertBoard(boardPages(TODAY), FIXTURE_TITLE);
    }).not.toThrow();
  });

  it('refuses when any page names another board, the second included', () => {
    const pages = boardPages(TODAY) as {
      data: { node: { title: string } };
    }[];
    const second = pages[1];
    expect(second).toBeDefined();
    if (second !== undefined) second.data.node.title = 'ShyTalk Stories';
    expect(() => {
      assertBoard(pages, FIXTURE_TITLE);
    }).toThrow(
      'the board is "ShyTalk Stories", not "Fixture Stories": nothing read',
    );
  });

  it('refuses a page that holds no board', () => {
    expect(() => {
      assertBoard([{ data: { node: null } }], FIXTURE_TITLE);
    }).toThrow(
      'a page came back without the board’s items: is the node id a project board?',
    );
  });
});

describe('closeOutLines', () => {
  it('gives both close-out lines for the shared fixture', () => {
    expect(
      closeOutLines(boardPages(TODAY), FIXTURE_TITLE, FIXTURE_REPO, TODAY),
    ).toEqual([
      'By tickets: 50% complete (3 of 6 in-scope stories closed; 1 epic, 1 post-launch and 1 closed as not planned left out). ' +
        'Measured pace 0.29 a day over the last 7 days (0, 0, 0, 1, 0, 1, 0). ' +
        'ETA at that pace: 2026-10-15, before outside waits.',
      'By effort: 33% complete (12 of 36 points closed; 1 closed story unscored, counted at the scored mean of 4.0 points (assumed)). ' +
        'Measured pace 1.14 points a day over the last 7 days (0, 0, 0, 3, 0, 5, 0). ' +
        'ETA at that pace: 2026-10-25, before outside waits.',
    ]);
  });

  it('refuses when any page names another board, the second included', () => {
    const pages = boardPages(TODAY) as {
      data: { node: { title: string } };
    }[];
    const second = pages[1];
    expect(second).toBeDefined();
    if (second !== undefined) second.data.node.title = 'ShyTalk Stories';
    expect(() =>
      closeOutLines(pages, FIXTURE_TITLE, FIXTURE_REPO, TODAY),
    ).toThrow(
      'the board is "ShyTalk Stories", not "Fixture Stories": nothing read',
    );
  });
});
