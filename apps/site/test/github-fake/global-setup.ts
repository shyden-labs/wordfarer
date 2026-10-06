import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import type { TestProject } from 'vitest/node';

/**
 * One RSA key pair for the roadmap App in the workerd tests (#341), made per
 * run so no private key is ever committed. The Worker gets the private half
 * as GitHub hands it out (PKCS#1 PEM) and also in PKCS#8; the fake GitHub
 * verifies every JWT with the public half.
 */
export default function setup(project: TestProject): void {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  project.provide('appKeyPkcs1', privateKey);
  project.provide(
    'appKeyPkcs8',
    createPrivateKey(privateKey)
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
  );
  project.provide('appPublicKey', publicKey);
}

declare module 'vitest' {
  export interface ProvidedContext {
    appKeyPkcs1: string;
    appKeyPkcs8: string;
    appPublicKey: string;
  }
}
