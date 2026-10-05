/**
 * Reading a workflow step's `run:` for the guards (#360). YAML types a plain
 * value, so `run: true # npm ci` parses as the boolean true. A guard that
 * assumed a string either crashed unnamed (`.trim()`) or matched the text
 * "true" (`regex.test`). Anything but a string or nothing is refused, naming
 * the step.
 */
export function runOf(step: {
  name?: string;
  uses?: string;
  run?: unknown;
}): string {
  if (step.run === undefined) return '';
  if (typeof step.run !== 'string')
    throw new Error(
      `step "${step.name ?? step.uses ?? '?'}": run is not a string: ${JSON.stringify(step.run)}`,
    );
  return step.run.trim();
}
