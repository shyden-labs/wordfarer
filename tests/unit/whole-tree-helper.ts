import { committableFiles } from './tracked-files';

/**
 * A helper that reads the whole checkout for the test that calls it: the
 * planted form setup-whole-tree.test.ts calls, so the unit setup is seen to
 * refuse a whole-tree read made through a module between the test and the
 * reader (#530 AC2). No unit test uses it otherwise.
 */
export const everyFileHere = (): string[] => committableFiles();
