import { cx } from "../../../../utils/cx";

// The four kinds of resource an epic holds. `packages/ui` imports no schema
// package, so this list repeats the one in
// `packages/api/src/schemas/resource.ts`.
export type ResourceKind = "doc" | "link" | "image" | "file";

export type ResourceListRow = {
	id: string;
	kind: ResourceKind;
	name: string;
	// The caller writes this text. It comes from the resource record, not
	// from this visual.
	detail: string;
	// The number of the pull request that carries this resource as evidence.
	pullRequest: number | null;
};

export type ResourceRowProps = {
	row: ResourceListRow;
	// The page decides what an open does for each kind. A page that leaves it
	// out gets a row of text that takes no click and no focus.
	onOpen?: (id: string) => void;
	// True for the row whose document is open beside the list.
	selected?: boolean;
};

const rowClass = "flex h-8 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left max-md:h-11 pointer-coarse:h-11";

// Every row draws the same shape, text size and color. The kind word at the
// left is the only difference.
export function ResourceRow({ row, onOpen, selected = false }: ResourceRowProps) {
	const content = (
		<>
			<span className="w-12 shrink-0 text-sm text-fg-faint">{row.kind}</span>
			{/* The name takes its full width, and the detail fills the width that is left. In a narrow list the detail is cut first, and the name is cut only when it alone is wider than the row. */}
			<span className="min-w-0 flex-[0_1_auto] truncate text-sm text-fg">{row.name}</span>
			<span className="min-w-0 flex-[1_1_0%] truncate text-right text-sm text-fg-muted tabular">
				{row.detail}
				{row.pullRequest !== null && ` · also evidence on #${row.pullRequest}`}
			</span>
		</>
	);
	return (
		<li>
			{onOpen === undefined ? (
				<div className={rowClass}>{content}</div>
			) : (
				<button
					type="button"
					onClick={() => onOpen(row.id)}
					aria-current={selected ? "page" : undefined}
					className={cx(
						rowClass,
						selected && "bg-band",
						"transition-colors duration-hover hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					)}
				>
					{content}
				</button>
			)}
		</li>
	);
}
