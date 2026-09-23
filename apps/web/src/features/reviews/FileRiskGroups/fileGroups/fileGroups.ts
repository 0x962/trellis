import { changedFilePaths, type PrPathGroup, type PrRiskReason, prPaths, prRiskReasons } from "@trellis/api";
import type { FileRiskGroup } from "@trellis/ui/review";
import type { ReadMarkFile } from "../../readMarks/readMarks";

// Noise starts collapsed, so its line count stays on screen and its tree stays
// out of the way.
const groupOrder: ReadonlyArray<{ key: PrPathGroup; label: string; expanded: boolean }> = [
	{ key: "risk", label: "Risk", expanded: true },
	{ key: "behavior", label: "Behavior", expanded: true },
	{ key: "tests", label: "Tests", expanded: true },
	{ key: "noise", label: "Noise", expanded: false },
];

export const collapsedDefaults = groupOrder.filter((group) => !group.expanded).map((group) => group.key);

// The words the tree prints for each reason a path sits in the risk group.
const reasonWords: Record<PrRiskReason, string> = {
	secret: "secret",
	auth: "auth",
	migration: "migration",
	dependency: "dependency",
	sharedType: "shared type",
	publicApi: "public API",
	deletedTest: "deleted test",
};

// Where a file sits inside its group. `prRiskReasons` runs from the reason
// that costs the most when it is wrong to the reason that costs the least, so
// the file whose strongest reason comes first in that list comes first here. A
// file with no reason takes the place after every file that has one.
const reasonRank = (reasons: PrRiskReason[]) =>
	reasons.length === 0 ? prRiskReasons.length : prRiskReasons.indexOf(reasons[0]!);

// The changed files, split into the four risk groups of `prPaths` and kept in
// the order a reader wants them: the risky files first.
export function fileGroups(repo: string, files: ReadMarkFile[]): FileRiskGroup[] {
	const facts = prPaths(repo, changedFilePaths(files));
	return groupOrder.map((group) => ({
		key: group.key,
		label: group.label,
		files: files
			.filter((file) => facts.groups[file.path] === group.key)
			.map((file) => ({
				path: file.path,
				change: file.change,
				additions: file.additions,
				deletions: file.deletions,
				binary: file.binary,
				reasonRank: reasonRank(facts.reasons[file.path]!),
				reasons: facts.reasons[file.path]!.map((reason) => reasonWords[reason]),
			}))
			.sort((left, right) => left.reasonRank - right.reasonRank)
			.map(({ reasonRank: _rank, ...file }) => file),
	}));
}
