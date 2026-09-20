import { useId } from "react";
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
	// True when the person marked the file read at the shape it has now.
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

const fileCount = (count: number) => (count === 1 ? "1 file" : `${count} files`);

const sumLines = (files: FileRiskRow[]) => ({
	additions: files.reduce((total, file) => total + file.additions, 0),
	deletions: files.reduce((total, file) => total + file.deletions, 0),
});

// The changed files of a pull request in the order the reviewer reads them:
// the files that carry risk first, then the files that carry behavior, then
// the tests, then the files a tool wrote. The caller fixes the group set and
// the order. Each group prints how many files it holds and how many lines
// they add and delete, so the reviewer can subtract a group before he starts.
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
	const files = groups.flatMap((group) => group.files);
	const read = files.filter((file) => file.read).length;
	return (
		<div className="flex flex-col">
			<header className="flex items-baseline justify-between gap-2 px-5 py-3 max-md:px-4">
				<h2 className="font-medium text-fg text-sm">Files</h2>
				<p className="text-fg-faint text-sm tabular" role="status" aria-live="polite">
					{read} of {files.length} read
				</p>
			</header>
			{files.length === 0 ? (
				<EmptyState
					className="px-5 pb-5 max-md:px-4"
					title="No changed files"
					description="This revision changes no file."
				/>
			) : (
				groups.map((group) => {
					const contentId = `${id}-${group.key}`;
					return (
						<section key={group.key} aria-label={`${group.label} files`}>
							<GroupHeader
								group={group.key}
								label={group.label}
								count={
									<span className="inline-flex items-center gap-1.5">
										{fileCount(group.files.length)}
										<span aria-hidden="true">·</span>
										<LineChanges value={sumLines(group.files)} pending={false} align="start" />
									</span>
								}
								showCount={fileCount(group.files.length)}
								expanded={!isCollapsed(group.key)}
								controls={contentId}
								onToggle={() => onToggle(group.key)}
								phone={phone}
							/>
							<ul id={contentId} hidden={isCollapsed(group.key)}>
								{group.files.map((file) => (
									<li
										key={file.path}
										className={cx(
											"flex h-8 items-center gap-2 px-5 transition-colors duration-hover max-md:h-11 max-md:px-4",
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
											className={cx(
												"min-w-0 flex-1 truncate rounded-sm text-left font-mono text-xs focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
												file.read ? "text-fg-faint" : "text-fg",
											)}
										>
											{file.path}
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
