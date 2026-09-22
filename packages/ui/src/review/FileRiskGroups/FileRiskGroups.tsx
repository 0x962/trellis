import { lazy, Suspense, useId, useMemo } from "react";
import { GroupHeader } from "../../domain/GroupHeader";
import { LineChanges } from "../../domain/LineChanges";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { EmptyState } from "../../primitives/EmptyState";
import { Skeleton } from "../../primitives/Skeleton";
import { cx } from "../../utils/cx";

// What a revision did to a file. `packages/ui` imports no package above it,
// so this repeats the change words of `ChangedFileSchema` in `@trellis/api`.
export type FileChange = "change" | "new" | "deleted" | "rename-pure" | "rename-changed";

export type FileRiskRow = {
	path: string;
	// What the revision did to the file. It sets the colour of the tree row.
	change: FileChange;
	additions: number;
	deletions: number;
	// True when the person marked the file read in the header of its diff.
	read: boolean;
};

export type FileRiskGroup = {
	key: string;
	label: string;
	files: FileRiskRow[];
};

export type FileRiskGroupsProps = {
	groups: FileRiskGroup[];
	// The path whose diff the pane shows. An empty string selects no row.
	selected: string;
	onSelect: (path: string) => void;
	isCollapsed: (key: string) => boolean;
	onToggle: (key: string) => void;
};

export const fileCountLabel = (count: number) => (count === 1 ? "1 file" : `${count} files`);

// `@pierre/trees` weighs more than every other part of this pane together, and
// only a person who opens a review ever sees it. The dynamic import puts the
// tree and its styles in a chunk of their own, which the browser fetches when
// the first review opens.
const GroupTree = lazy(() => import("./GroupTree/GroupTree").then((module) => ({ default: module.GroupTree })));

// A list of file groups, in the order the caller gives. Each group header
// shows the file count and the sum of the added and deleted lines, and each
// group holds the directory tree of its own files.
export function FileRiskGroups({ groups, selected, onSelect, isCollapsed, onToggle }: FileRiskGroupsProps) {
	const id = useId();
	const phone = useMediaQuery("(max-width: 767px)");
	const totals = useMemo(() => {
		const files = groups.flatMap((group) => group.files);
		return {
			files: files.length,
			read: files.filter((file) => file.read).length,
			perGroup: groups.map((group) => ({
				label: fileCountLabel(group.files.length),
				lines: {
					additions: group.files.reduce((total, file) => total + file.additions, 0),
					deletions: group.files.reduce((total, file) => total + file.deletions, 0),
				},
			})),
		};
	}, [groups]);
	return (
		<div className="flex flex-col">
			<header className="flex items-baseline justify-between gap-2 px-5 py-3 max-md:px-4">
				{/* Under 768 px the review page puts this list behind a button that
				    prints the word Files, so the word would appear twice, one line
				    apart. `sr-only` takes the heading off the screen and leaves it in
				    the accessibility tree, where it names this section. */}
				<h2 className={cx("font-medium text-base text-fg", phone && "sr-only")}>Files</h2>
				<p className="text-fg-faint text-sm tabular" role="status" aria-live="polite">
					{totals.read} of {totals.files} read
				</p>
			</header>
			{totals.files === 0 ? (
				<EmptyState
					className="px-5 pb-5 max-md:px-4"
					title="No changed files"
					description="This revision changes no file."
				/>
			) : (
				groups.map((group, index) => {
					const contentId = `${id}-${group.key}`;
					const total = totals.perGroup[index]!;
					const collapsed = isCollapsed(group.key);
					return (
						<section key={group.key} aria-label={`${group.label} files`}>
							<GroupHeader
								group={group.key}
								label={group.label}
								count={
									<span className="inline-flex items-center gap-1.5">
										{total.label}
										<span aria-hidden="true">·</span>
										<LineChanges value={total.lines} pending={false} align="start" />
									</span>
								}
								showCount={total.label}
								expanded={!collapsed}
								controls={contentId}
								onToggle={() => onToggle(group.key)}
								phone={phone}
							/>
							{/* The box stays in the tree while the group is collapsed, so the
							    `aria-controls` of the group header always names a live element.
							    A collapsed group draws no tree. */}
							<div id={contentId} hidden={collapsed} className="px-3 pb-2 max-md:px-2">
								{collapsed ? null : (
									<Suspense fallback={<Skeleton lines={group.files.length} />}>
										<GroupTree label={group.label} files={group.files} selected={selected} onSelect={onSelect} />
									</Suspense>
								)}
							</div>
						</section>
					);
				})
			)}
		</div>
	);
}
