import { FileRiskGroups as FileRiskGroupsView } from "@trellis/ui/review";
import { useMemo } from "react";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups";
import type { ReadMarkFile } from "../readMarks/readMarks";
import { collapsedDefaults, fileGroups } from "./fileGroups";

export type FileRiskGroupsProps = {
	// The pull request, as `owner/repo#number` or a GitHub URL. It keys the
	// collapse state of the groups.
	pr: string;
	// The repository name that picks the path rules, such as `trellis`.
	repo: string;
	// The changed files of the revision on screen, from `ReviewDiff onFiles`.
	files: ReadMarkFile[];
	// The paths the person marked read in the header of their diffs.
	read: ReadonlySet<string>;
	selected: string;
	onSelect: (path: string) => void;
};

export function FileRiskGroups({ pr, repo, files, read, selected, onSelect }: FileRiskGroupsProps) {
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#files`, collapsedDefaults);
	const groups = useMemo(() => fileGroups(repo, files, read), [repo, files, read]);
	return (
		<FileRiskGroupsView
			groups={groups}
			selected={selected}
			onSelect={onSelect}
			isCollapsed={isCollapsed}
			onToggle={toggle}
		/>
	);
}
