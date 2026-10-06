/**
 * The dev hostnames and the service binding each one reaches through the
 * adapter's Function, functions/[[path]].ts (#429). Every Shyden product's
 * dev lives at dev.{product}.shyden.co.uk (operator, 2026-10-06); the
 * site's name serves the pages and the game behind the dev password, the
 * API's name serves the sync Worker.
 *
 * A Map, not an object literal: a lookup by an arbitrary hostname must not
 * find a key every plain object inherits, such as `constructor`.
 */
export type DevBinding = 'SITE' | 'SYNC';

export const DEV_HOSTS: ReadonlyMap<string, DevBinding> = new Map([
  ['dev.yawelo-idle.shyden.co.uk', 'SITE'],
  ['dev-api.yawelo-idle.shyden.co.uk', 'SYNC'],
]);
