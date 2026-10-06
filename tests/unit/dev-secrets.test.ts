import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeSecretsFile } from '../../scripts/dev-secrets';

/**
 * The dev site Worker's secrets file (#357, #341): the deploy uploads each
 * secret from its `dev` environment secret with the Worker itself
 * (`wrangler deploy --secrets-file`), so no person types one into
 * Cloudflare. A missing one stops the deploy, naming the GitHub secret to set.
 */

const VALUES = {
  DEV_PASSWORD: 'pä:ss "quoted"\\ #not-a-comment\nline two',
  ROADMAP_WEBHOOK_SECRET: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
  ROADMAP_APP_KEY:
    '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----\n',
};
/** Each Worker secret, beside the dev environment secret it comes from. */
const SOURCES = [
  ['DEV_PASSWORD', 'DEV_BASIC_AUTH_PASSWORD'],
  ['ROADMAP_WEBHOOK_SECRET', 'ROADMAP_WEBHOOK_SECRET'],
  ['ROADMAP_APP_KEY', 'ROADMAP_APP_KEY'],
] as const;
const scratch = () =>
  join(mkdtempSync(join(tmpdir(), 'dev-secrets-')), 's.json');

describe('writeSecretsFile', () => {
  it('writes the three secrets, exactly, in JSON', () => {
    const path = scratch();
    writeSecretsFile(path, VALUES);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toStrictEqual(VALUES);
  });

  it('makes the file readable by its owner only', () => {
    const path = scratch();
    writeSecretsFile(path, VALUES);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  for (const [secret, source] of SOURCES) {
    it(`refuses a missing ${secret}, naming ${source}, and writes nothing`, () => {
      const path = scratch();
      expect(() => {
        writeSecretsFile(path, { ...VALUES, [secret]: undefined });
      }).toThrow(`${source} is not set`);
      expect(() => statSync(path)).toThrow('ENOENT');
    });

    it(`refuses an empty ${secret}, naming ${source}, and writes nothing`, () => {
      const path = scratch();
      expect(() => {
        writeSecretsFile(path, { ...VALUES, [secret]: '' });
      }).toThrow(`${source} is not set`);
      expect(() => statSync(path)).toThrow('ENOENT');
    });
  }

  it('refuses to overwrite a file already there', () => {
    const path = scratch();
    writeSecretsFile(path, VALUES);
    expect(() => {
      writeSecretsFile(path, { ...VALUES, DEV_PASSWORD: 'other' });
    }).toThrow('EEXIST');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toStrictEqual(VALUES);
  });
});
