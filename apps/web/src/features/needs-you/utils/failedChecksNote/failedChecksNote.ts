// The instruction that Re-run with agent adds to the brief: the names of
// the failed checks, in the order the checks arrive. No failed check gives
// no instruction.
export const failedChecksNote = (names: readonly string[]): string | undefined =>
	names.length === 0 ? undefined : `Fix the failed checks: ${names.join(", ")}.`;
