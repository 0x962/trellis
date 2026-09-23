import { type FileRiskGroup, FileRiskGroups as FileRiskGroupsView } from "@trellis/ui/review";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups";
import { collapsedDefaults } from "./fileGroups";

export type FileRiskGroupsProps = {
	// The pull request, as `owner/repo#number` or a GitHub URL. It keys the
	// collapse state of the groups.
	pr: string;
	// The changed files, grouped by `fileGroups`. The review page builds them,
	// because the diff pane draws its files in the same order.
	groups: FileRiskGroup[];
	// The paths the person marked read in the header of their diffs.
	read: ReadonlySet<string>;
	selected: string;
	onSelect: (path: string) => void;
};

export function FileRiskGroups({ pr, groups, read, selected, onSelect }: FileRiskGroupsProps) {
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#files`, collapsedDefaults);
	return (
		<FileRiskGroupsView
			groups={groups}
			read={read}
			selected={selected}
			onSelect={onSelect}
			isCollapsed={isCollapsed}
			onToggle={toggle}
		/>
	);
}
