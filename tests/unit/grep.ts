/**
 * The lines of `text` holding any of `needles` as a fixed string, numbered
 * from 1, as `git grep -n -F -e <needle>…` finds them in one file (#491): no
 * unit test starts git to grep. Lines end at `\n` alone, so a `\r` stays in
 * its line, as git keeps it; the empty piece after a final newline holds
 * no needle, since an empty needle is refused.
 * `ignoreCase` compares lower-cased text, as `-i` does.
 * tests/integration/grep.test.ts compares this with git grep on every file.
 */
export function grepLines(
  text: string,
  needles: readonly string[],
  { ignoreCase = false }: { readonly ignoreCase?: boolean } = {},
): { line: number; text: string }[] {
  if (needles.length === 0) throw new Error('grepLines: no needle to find');
  if (needles.includes(''))
    throw new Error('grepLines: an empty needle matches every line');
  const fold = (value: string) => (ignoreCase ? value.toLowerCase() : value);
  const folded = needles.map(fold);
  return text
    .split('\n')
    .flatMap((line, index) =>
      folded.some((needle) => fold(line).includes(needle))
        ? [{ line: index + 1, text: line }]
        : [],
    );
}
