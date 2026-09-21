import { type PrPathGroup, prPaths } from "@trellis/api";
import { FileRiskGroups as FileRiskGroupsView } from "@trellis/ui/review";
import { useMemo, useState } from "react";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups";
import { isRead, loadReadMarks, type ReadMarkFile, saveReadMarks, setReadMark } from "./readMarks/readMarks";

// Noise starts collapsed, so its line count stays on screen and its rows stay
// out of the way.
const groupOrder: ReadonlyArray<{ key: PrPathGroup; label: string; expanded: boolean }> = [
	{ key: "risk", label: "Risk", expanded: true },
	{ key: "behavior", label: "Behavior", expanded: true },
	{ key: "tests", label: "Tests", expanded: true },
	{ key: "noise", label: "Noise", expanded: false },
];

const collapsedDefaults = groupOrder.filter((group) => !group.expanded).map((group) => group.key);

export type FileRiskGroupsProps = {
	// The pull request, as `owner/repo#number` or a GitHub URL. It keys the
	// read marks and the collapse state.
	pr: string;
	// The repository name that picks the path rules, such as `trellis`.
	repo: string;
	// The changed files of the revision on screen, from `ReviewDiff onFiles`.
	files: ReadMarkFile[];
	selected: string;
	onSelect: (path: string) => void;
};

export function FileRiskGroups({ pr, repo, files, selected, onSelect }: FileRiskGroupsProps) {
	const [marks, setMarks] = useState(() => loadReadMarks(localStorage, pr));
	// `marks` holds the entry of one pull request. `markedPr` names it. When the
	// caller passes another pull request, the render below reads that entry
	// before it draws, so a mark of the previous pull request never reaches the
	// new entry.
	const [markedPr, setMarkedPr] = useState(pr);
	if (markedPr !== pr) {
		setMarkedPr(pr);
		setMarks(loadReadMarks(localStorage, pr));
	}
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#files`, collapsedDefaults);
	const groupByPath = useMemo(() => prPaths(repo, files).groups, [repo, files]);
	const groups = useMemo(
		() =>
			groupOrder.map((group) => ({
				key: group.key,
				label: group.label,
				files: files
					.filter((file) => groupByPath[file.path] === group.key)
					.map((file) => ({
						path: file.path,
						additions: file.additions,
						deletions: file.deletions,
						read: isRead(marks, file),
					})),
			})),
		[files, groupByPath, marks],
	);
	const onToggleRead = (path: string, read: boolean) => {
		const file = files.find((entry) => entry.path === path)!;
		const next = setReadMark(marks, file, read);
		saveReadMarks(localStorage, pr, next);
		setMarks(next);
	};
	// `review.css` reads `review-file-groups` to hide the heading of the list
	// on a phone, where the button above the list already prints the word
	// Files.
	return (
		<div className="review-file-groups">
			<FileRiskGroupsView
				groups={groups}
				selected={selected}
				onSelect={onSelect}
				onToggleRead={onToggleRead}
				isCollapsed={isCollapsed}
				onToggle={toggle}
			/>
		</div>
	);
}
