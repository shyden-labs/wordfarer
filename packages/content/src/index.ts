/**
 * A course pack, loaded and validated (#101; spec §5.1, §5.2). The build
 * refuses a malformed pack here, so the engine never meets bad data.
 *
 * The pack is the spec's flat shape. Lexicon items carry exactly #101 AC2's
 * fields; every other kind is a strict `{ id }` until the story that reads
 * more adds it (#102, #110, #462). Every object is strict (AC4), so a typo
 * such as `translation` is refused rather than ignored.
 */
import { z } from 'zod';
import { CEFR_LEVELS } from '@yawelo-idle/core';

const LANGUAGES = ['en', 'id'] as const;
const REVIEW_STATUSES = [
  'draft',
  'claude-checked',
  'native-reviewed',
  'rejected',
] as const;

/** Holds at least one character that is not whitespace. */
const VISIBLE = /\S/;

/**
 * Spec §5.2's review block. Every key is required, so a draft writes `null`
 * rather than leaving a key out, and an omission or a typo is an error.
 * Evidence and history are #51's.
 */
const review = z.strictObject({
  status: z.enum(REVIEW_STATUSES),
  reviewer: z.string().min(1).nullable(),
  reviewedAt: z.iso.datetime({ offset: true }).nullable(),
  notes: z.string(),
});

const lexiconItem = z.strictObject({
  id: z.string(),
  target: z.string(),
  translations: z.array(z.string()).min(1),
  pos: z.string(),
  tags: z
    .array(z.string())
    .min(1)
    .refine((tags) => new Set(tags).size === tags.length, {
      message: 'a tag appears twice',
    }),
  example: z.strictObject({ target: z.string(), translation: z.string() }),
  cefr: z.enum(CEFR_LEVELS),
  // Required for an `en` target; checked on the course, which knows it.
  pronunciation: z
    .string()
    .regex(VISIBLE, { message: 'is whitespace only' })
    .optional(),
  // Spoken audio is a later update (spec D5); the slot exists and is unused.
  audio: z.string().optional(),
  source: z.string(),
  licence: z.string(),
  review,
});

/** A kind no story reads yet: an id and nothing else. */
const idOnly = z.strictObject({ id: z.string() });

export const courseSchema = z
  .strictObject({
    id: z.string(),
    sourceLang: z.enum(LANGUAGES),
    targetLang: z.enum(LANGUAGES),
    regions: z.array(idOnly),
    destinations: z.array(idOnly),
    encounters: z.array(idOnly),
    lexicon: z.array(lexiconItem),
    grammarNodes: z.array(idOnly),
    cultureCards: z.array(idOnly),
    motifs: z.array(idOnly),
    story: z.array(idOnly),
  })
  .superRefine((course, context) => {
    if (course.sourceLang === course.targetLang)
      context.addIssue({
        code: 'custom',
        path: ['targetLang'],
        message: `is the same as sourceLang (${course.sourceLang})`,
      });
    if (course.targetLang !== 'en') return;
    course.lexicon.forEach((item, index) => {
      if (item.pronunciation === undefined)
        context.addIssue({
          code: 'custom',
          path: ['lexicon', index, 'pronunciation'],
          message: 'is required when the target language is en',
        });
    });
  });

export type CoursePack = z.output<typeof courseSchema>;
export type LexiconEntry = CoursePack['lexicon'][number];

/** One reason a pack was refused, naming the item and the field. */
export interface LoadError {
  /** The pack's array the item sits in (`lexicon`), or `course`. */
  readonly kind: string;
  /** The item's `id`, `#<index>` when it has none, or `course`. */
  readonly item: string;
  /** The dotted path inside the item (`example.target`), or the course field. */
  readonly field: string;
  readonly message: string;
}

export type LoadResult =
  | { readonly ok: true; readonly course: CoursePack }
  | { readonly ok: false; readonly errors: readonly LoadError[] };

export function loadCourse(json: unknown): LoadResult {
  const parsed = courseSchema.safeParse(json);
  if (parsed.success) return { ok: true, course: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.flatMap((issue) => errorsOf(json, issue)),
  };
}

/** The item at `kind[index]` names itself by its `id`, read from the input. */
function itemName(json: unknown, kind: string, index: number): string {
  const items = isRecord(json) ? json[kind] : undefined;
  const item: unknown = Array.isArray(items) ? items[index] : undefined;
  return isRecord(item) && typeof item.id === 'string'
    ? item.id
    : `#${String(index)}`;
}

function errorsOf(json: unknown, issue: z.core.$ZodIssue): LoadError[] {
  const [head, index, ...rest] = issue.path;
  const inItem = typeof head === 'string' && typeof index === 'number';
  const kind = inItem ? head : 'course';
  const item = inItem ? itemName(json, head, index) : 'course';
  const within = (inItem ? rest : issue.path).map(String);
  // An unknown key is reported at the object holding it, naming the keys.
  const fields =
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => [...within, key].join('.'))
      : [within.join('.')];
  return fields.map((field) => ({
    kind,
    item,
    field,
    message: `${kind} ${item}: ${field || '(the pack)'} ${issue.message}`,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
