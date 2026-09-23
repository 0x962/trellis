// The check counts of one pull request row. A canceled check counts in
// `fail`, and a skipped check counts in neither, so these three numbers
// answer whether every check that ran has passed.
export type PrChecks = { id: string; pass: number; fail: number; pending: number };

// True when the row has at least one check and none of them failed, was
// canceled, or is still running.
export const allPassed = (pr: PrChecks) => pr.pass > 0 && pr.fail === 0 && pr.pending === 0;

// The pull requests whose checks turned all-passed since the last call, and
// the record to compare the next call against.
//
// A pull request the record does not already hold is written down and
// nothing else: a row that is already all-passed when the page opens, or
// when a refetch first brings it into the list, celebrates nothing. The
// record keeps every pull request it has ever seen, so a row that scrolls
// out of the list and back celebrates nothing either.
//
// A new push turns the checks back to pending and then to all-passed again,
// which is a second turn and celebrates again.
export function confettiStarts(seen: ReadonlyMap<string, boolean>, prs: readonly PrChecks[]) {
	const next = new Map(seen);
	const started: string[] = [];
	for (const pr of prs) {
		const now = allPassed(pr);
		if (now && seen.get(pr.id) === false) started.push(pr.id);
		next.set(pr.id, now);
	}
	return { started, next };
}
