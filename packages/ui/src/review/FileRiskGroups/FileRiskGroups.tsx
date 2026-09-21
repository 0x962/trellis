import { useId, useMemo } from "react";
import { GroupHeader } from "../../domain/GroupHeader";
import { LineChanges } from "../../domain/LineChanges";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Checkbox } from "../../primitives/Checkbox";
import { EmptyState } from "../../primitives/EmptyState";
import { cx } from "../../utils/cx";

export type FileRiskRow = {
	path: string;
	additions: number;
	deletions: number;
	// True when the person marked the file read.
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
	onToggleRead: (path: string, read: boolean) => void;
	isCollapsed: (key: string) => boolean;
	onToggle: (key: string) => void;
};

export const fileCountLabel = (count: number) => (count === 1 ? "1 file" : `${count} files`);

// A path splits into the folder that holds the file, and the file name with
// the slash before it. A row prints the two apart, because this list can sit
// in a pane of 340px. There the folder loses its start and the file name stays
// whole, and the file name is what tells two files of one folder apart.
const splitPath = (path: string) => {
	const cut = path.lastIndexOf("/");
	return cut === -1 ? { folder: "", name: path } : { folder: path.slice(0, cut), name: path.slice(cut) };
};

// A list of file groups, in the order the caller gives. Each group header
// shows the file count and the sum of the added and deleted lines.
export function FileRiskGroups({
	groups,
	selected,
	onSelect,
	onToggleRead,
	isCollapsed,
	onToggle,
}: FileRiskGroupsProps) {
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
				<h2 className={cx("font-medium text-fg text-sm", phone && "sr-only")}>Files</h2>
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
							{/* The list stays in the tree while the group is collapsed, so the
							    `aria-controls` of the group header always names a live element.
							    A collapsed group draws no row. */}
							<ul id={contentId} hidden={collapsed}>
								{collapsed
									? null
									: group.files.map((file) => (
											<li
												key={file.path}
												className={cx(
													"flex h-8 items-center gap-2 px-5 transition-colors duration-hover max-md:h-11 max-md:px-4 pointer-coarse:h-11",
													file.path === selected ? "bg-accent-soft" : "hover:bg-band",
												)}
											>
												<Checkbox
													label={`Mark ${file.path} read`}
													hideLabel
													checked={file.read}
													onCheckedChange={(next) => onToggleRead(file.path, next)}
												/>
												<button
													type="button"
													onClick={() => onSelect(file.path)}
													title={file.path}
													className={cx(
														"flex min-w-0 flex-1 rounded-sm text-left font-mono text-xs focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
														file.read ? "text-fg-faint" : "text-fg",
													)}
												>
													{/* The two spans below draw the path in two parts, so neither reads as
													    the path on its own. The hidden span holds the whole path, and it
													    alone names the button. `dir="rtl"` puts the ellipsis of the folder
													    on the left, so a narrow pane cuts the start of the path and keeps
													    the folder that holds the file. */}
													<span className="sr-only">{file.path}</span>
													<span aria-hidden="true" dir="rtl" className="min-w-0 truncate text-fg-faint">
														{splitPath(file.path).folder}
													</span>
													<span aria-hidden="true" className="shrink-0">
														{splitPath(file.path).name}
													</span>
												</button>
												<LineChanges value={{ additions: file.additions, deletions: file.deletions }} pending={false} />
											</li>
										))}
							</ul>
						</section>
					);
				})
			)}
		</div>
	);
}
