/**
 * GitHub's webhook deliveries to `/hooks/github` (#341, website spec §5.2
 * item 2). A delivery is believed only when `X-Hub-Signature-256` is the
 * HMAC-SHA256 of its exact body under the shared secret, compared in constant
 * time (`crypto.subtle.timingSafeEqual`; tests/unit/webhook-compare.test.ts
 * refuses any other comparison here). Only a believed delivery's JSON is
 * read, and only to decide whether the board needs reading.
 */

/** What a verified delivery asks of the roadmap. */
export type EventVerdict = 'read' | 'ping' | 'ignore';

/** `sha256=` and 64 lower-case hex digits, the only form GitHub sends. */
const HEADER = /^sha256=([0-9a-f]{64})$/;

function hexBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1)
    bytes[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

/**
 * Whether `header` signs `body` under `secret`. A missing or empty secret
 * refuses everything: anyone can sign with an empty key.
 */
export async function verifySignature(
  secret: string | undefined,
  body: string | ArrayBuffer,
  header: string | null,
): Promise<boolean> {
  if (secret === undefined || secret.length === 0) return false;
  const claimed = HEADER.exec(header ?? '')?.[1];
  if (claimed === undefined) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = await crypto.subtle.sign(
    'HMAC',
    key,
    typeof body === 'string' ? encoder.encode(body) : body,
  );
  return crypto.subtle.timingSafeEqual(expected, hexBytes(claimed));
}

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;

/**
 * What a verified delivery means for one board. Org webhooks deliver every
 * repository's `issues` and every org board's `projects_v2_item` (ShyTalk's
 * included), so only the board's own repository and the board itself cause a
 * read; a `ping` is answered without one.
 */
export function classifyEvent(
  name: string,
  payload: unknown,
  board: { id: string; repo: string },
): EventVerdict {
  if (name === 'ping') return 'ping';
  if (name === 'issues')
    return field(field(payload, 'repository'), 'full_name') === board.repo
      ? 'read'
      : 'ignore';
  if (name === 'projects_v2_item')
    return field(field(payload, 'projects_v2_item'), 'project_node_id') ===
      board.id
      ? 'read'
      : 'ignore';
  return 'ignore';
}
