/**
 * What the fake GitHub (fake-github.ts, Node) and the workerd tests that steer
 * it share (#341): its identities and the shapes of its controls. No Node
 * import here, so the workerd test program can read it.
 */
export const FAKE_APP_ID = '424242';
export const FAKE_INSTALLATION_ID = 99;
export const FAKE_TOKEN = 'ghs_fake-installation-token';
export const FAKE_ORG = 'shyden-labs';
export const FAKE_REPO_NAME = 'fixture';
export const FAKE_BOARD_ID = 'PVT_fixture';

export type Permissions = Record<string, string>;
export const READ_ONLY: Permissions = {
  issues: 'read',
  metadata: 'read',
  organization_projects: 'read',
};

/** What a test can change; `reset` puts every field back. */
export interface FakeConfig {
  repositorySelection: 'selected' | 'all';
  installationPermissions: Permissions;
  tokenPermissions: Permissions;
  tokenRepositories: string[];
  /** Raw pages served in order; `null` serves the shared fixture for today. */
  pages: unknown[] | null;
  /** Answer GraphQL with this HTTP status instead of the page. */
  graphqlStatus: number;
  /** Answer GraphQL 200 with this `errors` body instead of the page. */
  graphqlErrors: { message: string }[] | null;
  /** Say every page has a next one, as a broken paginator would. */
  endlessPages: boolean;
}

/** One request as the fake received it. */
export interface Seen {
  method: string;
  url: string;
  userAgent: string | null;
  /** For GraphQL: the cursor asked for (`null` for the first page). */
  cursor?: string | null;
  /** For an App call: the JWT's claims once verified. */
  claims?: { iat: number; exp: number; iss: string };
}
