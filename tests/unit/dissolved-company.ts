/**
 * The former limited company's name and its old GitHub org handle, in any
 * spacing or case (Refs #49). Its spellings are tested in
 * tests/unit/licences.test.ts; the sweep of every committable file that uses
 * it is in tests/guards/licences.test.ts (#515).
 */
export const DISSOLVED = /shyden[\s_-]*(?:ltd|limited)\b/i;
