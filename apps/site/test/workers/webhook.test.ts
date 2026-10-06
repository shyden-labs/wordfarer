import { describe, expect, it } from 'vitest';
import { classifyEvent, verifySignature } from '../../worker/webhook';

/**
 * The webhook's door (#341, spec §5.2 item 2): a delivery is believed only
 * when its X-Hub-Signature-256 is the HMAC-SHA256 of the exact body under the
 * shared secret, and only then is its JSON read. The vector is GitHub's own,
 * from "Validating webhook deliveries" (read 2026-10-06), so the verifier is
 * held to an answer it did not compute.
 */
const SECRET = "It's a Secret to Everybody";
const BODY = 'Hello, World!';
const SIGNATURE =
  'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';

describe('verifySignature', () => {
  it('accepts GitHub’s own signature over the exact body', async () => {
    expect(await verifySignature(SECRET, BODY, SIGNATURE)).toBe(true);
  });

  it('refuses a signature made with another secret', async () => {
    expect(await verifySignature(`${SECRET}.`, BODY, SIGNATURE)).toBe(false);
  });

  it('refuses the right signature over a body with one byte flipped', async () => {
    expect(await verifySignature(SECRET, 'Hello, World?', SIGNATURE)).toBe(
      false,
    );
  });

  it('refuses a signature with one hex digit flipped', async () => {
    const flipped = `${SIGNATURE.slice(0, -1)}${SIGNATURE.endsWith('7') ? '8' : '7'}`;
    expect(await verifySignature(SECRET, BODY, flipped)).toBe(false);
  });

  it('refuses a delivery with no signature header', async () => {
    expect(await verifySignature(SECRET, BODY, null)).toBe(false);
  });

  it('refuses the SHA-1 header form', async () => {
    expect(
      await verifySignature(
        SECRET,
        BODY,
        'sha1=01dc10d0c83e72ed246219cdd91669667fe2ca59',
      ),
    ).toBe(false);
  });

  it('refuses a digest one hex digit short', async () => {
    expect(await verifySignature(SECRET, BODY, SIGNATURE.slice(0, -1))).toBe(
      false,
    );
  });

  it('refuses a digest one hex digit long', async () => {
    expect(await verifySignature(SECRET, BODY, `${SIGNATURE}7`)).toBe(false);
  });

  it('refuses a digest with a character that is not hex', async () => {
    expect(
      await verifySignature(SECRET, BODY, `${SIGNATURE.slice(0, -1)}g`),
    ).toBe(false);
  });

  it('refuses the right digest in upper case, which GitHub never sends', async () => {
    expect(
      await verifySignature(
        SECRET,
        BODY,
        `sha256=${SIGNATURE.slice(7).toUpperCase()}`,
      ),
    ).toBe(false);
  });

  it('refuses every delivery when the secret is empty, since anyone can sign with an empty key', async () => {
    // HMAC-SHA256 of BODY under an empty key, from Python's hmac module
    // (workerd will not import an empty key, so it cannot be made here).
    const signed =
      'sha256=2bbcfa9524f3218c7a34b30e6936f8b1a4516cb097f1a85a1c7d98b5977ec769';
    expect(await verifySignature('', BODY, signed)).toBe(false);
  });

  it('refuses every delivery when the secret is missing', async () => {
    expect(await verifySignature(undefined, BODY, SIGNATURE)).toBe(false);
  });
});

describe('classifyEvent', () => {
  const board = { id: 'PVT_board', repo: 'shyden-labs/game' };

  it('answers a ping without a read', () => {
    expect(
      classifyEvent('ping', { zen: 'Keep it logically awesome.' }, board),
    ).toBe('ping');
  });

  it('reads the board for an issue event from the board’s repository', () => {
    expect(
      classifyEvent(
        'issues',
        { repository: { full_name: 'shyden-labs/game' } },
        board,
      ),
    ).toBe('read');
  });

  it('ignores an issue event from another repository in the org', () => {
    expect(
      classifyEvent(
        'issues',
        { repository: { full_name: 'shyden-labs/shytalk' } },
        board,
      ),
    ).toBe('ignore');
  });

  it('ignores an issue event that names no repository', () => {
    expect(classifyEvent('issues', {}, board)).toBe('ignore');
  });

  it('reads the board for an item event on this board', () => {
    expect(
      classifyEvent(
        'projects_v2_item',
        { projects_v2_item: { project_node_id: 'PVT_board' } },
        board,
      ),
    ).toBe('read');
  });

  it('ignores an item event on another org board, such as ShyTalk’s', () => {
    expect(
      classifyEvent(
        'projects_v2_item',
        { projects_v2_item: { project_node_id: 'PVT_other' } },
        board,
      ),
    ).toBe('ignore');
  });

  it('ignores an item event that names no board', () => {
    expect(
      classifyEvent('projects_v2_item', { projects_v2_item: {} }, board),
    ).toBe('ignore');
  });

  it('ignores an event it was not subscribed for', () => {
    expect(
      classifyEvent(
        'push',
        { repository: { full_name: 'shyden-labs/game' } },
        board,
      ),
    ).toBe('ignore');
  });

  it('ignores a payload that is not an object', () => {
    expect(classifyEvent('issues', null, board)).toBe('ignore');
  });
});
