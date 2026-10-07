import { describe, expect, it } from 'vitest';
import enId from './fixtures/en-id.min.json' with { type: 'json' };
import idEn from './fixtures/id-en.min.json' with { type: 'json' };
import { loadCourse, type LoadError } from '../src/index';

/**
 * Loading a course pack (#101). Every refusal names the item and the field
 * (AC1, AC3), so each case asserts the whole error list, not just `ok`.
 */

type Json = Record<string, unknown>;

/** A deep copy, so a case edits its own pack and never the fixture. */
const copy = (pack: object): Json => JSON.parse(JSON.stringify(pack)) as Json;

/** The pack's first lexicon item, for a case to edit in place. */
const firstItem = (pack: Json): Json => {
  const lexicon = pack.lexicon;
  if (!Array.isArray(lexicon) || lexicon.length === 0)
    throw new Error('fixture has no lexicon item');
  return lexicon[0] as Json;
};

const refusal = (json: unknown): readonly LoadError[] => {
  const result = loadCourse(json);
  if (result.ok) throw new Error('expected a refusal, and the pack loaded');
  return result.errors;
};

/** One lexicon error on `item`/`field`, its message naming both. */
const lexiconError = (item: string, field: string) => ({
  kind: 'lexicon',
  item,
  field,
  message: expect.stringMatching(
    new RegExp(`${item}[^]*${field.replace('.', '\\.')}`),
  ) as unknown,
});

describe('loadCourse: both minimal fixtures load (AC6)', () => {
  it('loads the minimal en-id pack, unchanged', () => {
    expect(loadCourse(copy(enId))).toEqual({ ok: true, course: enId });
  });

  it('loads the minimal id-en pack, unchanged', () => {
    expect(loadCourse(copy(idEn))).toEqual({ ok: true, course: idEn });
  });

  it('refuses a pack whose source and target language are the same', () => {
    const pack = copy(enId);
    pack.sourceLang = 'id';
    expect(refusal(pack)).toEqual([
      {
        kind: 'course',
        item: 'course',
        field: 'targetLang',
        message: expect.stringContaining('targetLang') as unknown,
      },
    ]);
  });
});

describe('loadCourse: AC3’s boundary cases, each named by item and field', () => {
  it('refuses an empty translations list', () => {
    const pack = copy(enId);
    firstItem(pack).translations = [];
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'translations')]);
  });

  it('refuses cefr B2', () => {
    const pack = copy(enId);
    firstItem(pack).cefr = 'B2';
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'cefr')]);
  });

  it('refuses an empty tags list', () => {
    const pack = copy(enId);
    firstItem(pack).tags = [];
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'tags')]);
  });

  it('refuses a tag duplicated inside one item', () => {
    const pack = copy(enId);
    firstItem(pack).tags = ['home', 'home'];
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'tags')]);
  });

  it('refuses a whitespace-only pronunciation on an id-en item', () => {
    const pack = copy(idEn);
    firstItem(pack).pronunciation = ' \t ';
    expect(refusal(pack)).toEqual([lexiconError('house', 'pronunciation')]);
  });
});

describe('loadCourse: strict, so a typo fails (AC4)', () => {
  it('refuses translation, a typo for translations, naming the key', () => {
    const pack = copy(enId);
    firstItem(pack).translation = ['house'];
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'translation')]);
  });

  it('refuses an unknown key on the course itself', () => {
    const pack = copy(enId);
    pack.lexicons = [];
    expect(refusal(pack)).toEqual([
      {
        kind: 'course',
        item: 'course',
        field: 'lexicons',
        message: expect.stringContaining('lexicons') as unknown,
      },
    ]);
  });

  it('refuses an unknown key on a kind that carries only an id', () => {
    const pack = copy(enId);
    (pack.regions as Json[])[0] = { id: 'jawa', name: 'Jawa' };
    expect(refusal(pack)).toEqual([
      {
        kind: 'regions',
        item: 'jawa',
        field: 'name',
        message: expect.stringContaining('name') as unknown,
      },
    ]);
  });
});

describe('loadCourse: AC2’s required lexicon fields', () => {
  it.each([
    'target',
    'translations',
    'pos',
    'tags',
    'example',
    'cefr',
    'source',
    'licence',
    'review',
  ])('refuses an item missing %s', (field) => {
    const pack = copy(enId);
    pack.lexicon = [
      Object.fromEntries(
        Object.entries(firstItem(pack)).filter(([key]) => key !== field),
      ),
    ];
    expect(refusal(pack)).toEqual([lexiconError('rumah', field)]);
  });

  it('refuses an item missing id, naming it by its index', () => {
    const pack = copy(enId);
    delete firstItem(pack).id;
    expect(refusal(pack)).toEqual([lexiconError('#0', 'id')]);
  });

  it('refuses an example missing its translation', () => {
    const pack = copy(enId);
    delete (firstItem(pack).example as Json).translation;
    expect(refusal(pack)).toEqual([
      lexiconError('rumah', 'example.translation'),
    ]);
  });
});

describe('loadCourse: pronunciation and audio (AC2)', () => {
  it('refuses an id-en item with no pronunciation, as an en target needs one', () => {
    const pack = copy(idEn);
    delete firstItem(pack).pronunciation;
    expect(refusal(pack)).toEqual([lexiconError('house', 'pronunciation')]);
  });

  it('loads an en-id item that gives a pronunciation, which is optional there', () => {
    const pack = copy(enId);
    firstItem(pack).pronunciation = 'ROO-mah';
    expect(loadCourse(pack)).toEqual({ ok: true, course: pack });
  });

  it('loads an item that carries audio, which is optional and unused', () => {
    const pack = copy(enId);
    firstItem(pack).audio = 'rumah.ogg';
    expect(loadCourse(pack)).toEqual({ ok: true, course: pack });
  });
});

describe('loadCourse: the review block (spec §5.2)', () => {
  it('refuses a review missing its reviewer key, even on a draft', () => {
    const pack = copy(enId);
    delete (firstItem(pack).review as Json).reviewer;
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'review.reviewer')]);
  });

  it('refuses a reviewedAt that is a date without a time', () => {
    const pack = copy(enId);
    firstItem(pack).review = {
      status: 'claude-checked',
      reviewer: 'claude',
      reviewedAt: '2026-10-07',
      notes: '',
    };
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'review.reviewedAt')]);
  });

  it('loads a reviewedAt with an offset', () => {
    const pack = copy(enId);
    firstItem(pack).review = {
      status: 'claude-checked',
      reviewer: 'claude',
      reviewedAt: '2026-10-07T12:40:00+07:00',
      notes: 'two sources',
    };
    expect(loadCourse(pack)).toEqual({ ok: true, course: pack });
  });

  it('refuses a status outside the four', () => {
    const pack = copy(enId);
    (firstItem(pack).review as Json).status = 'approved';
    expect(refusal(pack)).toEqual([lexiconError('rumah', 'review.status')]);
  });
});

describe('loadCourse: input that is not a pack', () => {
  it('refuses null as a course, naming no item', () => {
    expect(refusal(null)).toEqual([
      {
        kind: 'course',
        item: 'course',
        field: '',
        message: expect.any(String) as unknown,
      },
    ]);
  });
});
