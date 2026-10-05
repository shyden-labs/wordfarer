import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeSecretsFile } from '../../scripts/dev-secrets';

/**
 * The dev web Worker's secrets file (#357): the deploy uploads the dev
 * password from the `dev` environment secret with the Worker itself
 * (`wrangler deploy --secrets-file`), so no person types it into Cloudflare.
 */

const PASSWORD = 'pä:ss "quoted"\\ #not-a-comment\nline two';
const scratch = () =>
  join(mkdtempSync(join(tmpdir(), 'dev-secrets-')), 's.json');

describe('writeSecretsFile', () => {
  it('writes the password as DEV_PASSWORD, exactly, in JSON', () => {
    const path = scratch();
    writeSecretsFile(path, PASSWORD);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toStrictEqual({
      DEV_PASSWORD: PASSWORD,
    });
  });

  it('makes the file readable by its owner only', () => {
    const path = scratch();
    writeSecretsFile(path, PASSWORD);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it('refuses a missing password, writing nothing', () => {
    const path = scratch();
    expect(() => {
      writeSecretsFile(path, undefined);
    }).toThrow('DEV_BASIC_AUTH_PASSWORD is not set');
    expect(() => statSync(path)).toThrow('ENOENT');
  });

  it('refuses an empty password, writing nothing', () => {
    const path = scratch();
    expect(() => {
      writeSecretsFile(path, '');
    }).toThrow('DEV_BASIC_AUTH_PASSWORD is not set');
    expect(() => statSync(path)).toThrow('ENOENT');
  });

  it('refuses to overwrite a file already there', () => {
    const path = scratch();
    writeSecretsFile(path, PASSWORD);
    expect(() => {
      writeSecretsFile(path, 'other');
    }).toThrow('EEXIST');
    expect(JSON.parse(readFileSync(path, 'utf8'))).toStrictEqual({
      DEV_PASSWORD: PASSWORD,
    });
  });
});
