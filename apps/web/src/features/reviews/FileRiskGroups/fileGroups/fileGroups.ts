import { changedFilePaths, type PrPathGroup, prPaths } from "@trellis/api";
import type { FileRiskGroup } from "@trellis/ui/review";
import type { ReadMarkFile } from "../../readMarks/readMarks";

// Noise starts collapsed, so its line count stays on screen and its tree stays
// out of the way.
export const groupOrder: ReadonlyArray<{ key: PrPathGroup; label: string; expanded: boolean }> = [
	{ key: "risk", label: "Risk", expanded: true },
	{ key: "behavior", label: "Behavior", expanded: true },
	{ key: "tests", label: "Tests", expanded: true },
	{ key: "noise", label: "Noise", expanded: false },
];

export const collapsedDefaults = groupOrder.filter((group) => !group.expanded).map((group) => group.key);

// The changed files, split into the four risk groups of `prPaths` and kept in
// the order a reader wants them: the risky files first.
export function fileGroups(repo: string, files: ReadMarkFile[], read: ReadonlySet<string>): FileRiskGroup[] {
	const groupByPath = prPaths(repo, changedFilePaths(files)).groups;
	return groupOrder.map((group) => ({
		key: group.key,
		label: group.label,
		files: files
			.filter((file) => groupByPath[file.path] === group.key)
			.map((file) => ({
				path: file.path,
				change: file.change,
				additions: file.additions,
				deletions: file.deletions,
				read: read.has(file.path),
			})),
	}));
}
