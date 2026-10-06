/**
 * Steering the fake GitHub from inside workerd (#341): the requests go out
 * through the same outbound route as the Worker's, to
 * test/github-fake/fake-github.ts.
 */
import type { FakeConfig, Seen } from '../github-fake/contract';

export type { FakeConfig, Seen };

export async function resetFake(): Promise<void> {
  await fetch('https://fake-github.test/reset', { method: 'POST' });
}

export async function configureFake(
  config: Partial<FakeConfig>,
): Promise<void> {
  await fetch('https://fake-github.test/configure', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function seenByFake(): Promise<Seen[]> {
  return (await fetch('https://fake-github.test/seen')).json<Seen[]>();
}
