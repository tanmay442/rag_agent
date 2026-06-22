// Returns true if this module was invoked as the program root
// (e.g. `tsx init.ts` or `tsx packages/cli/src/commands/init.ts`).
// Used by the command files to gate their CLI entry blocks.
export function isMainModule(): boolean {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
}
