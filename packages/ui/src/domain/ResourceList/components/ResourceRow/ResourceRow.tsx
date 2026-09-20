import { cx } from "../../../../utils/cx";

// The four kinds of resource an epic holds. `packages/ui` imports no
// schema package, so this list repeats the one in
// `packages/api/src/schemas/resource.ts`.
export type ResourceKind = "doc" | "link" | "image" | "file";

export type ResourceRowValue = {
	id: string;
	kind: ResourceKind;
	// What a person calls this resource.
	name: string;
	// The words that print after the name: the edit line of a doc, the host
	// of a link, or the size of an image or a file. The caller writes them,
	// because they come from the resource record and not from this visual.
	detail: string;
	// The number of the pull request that carries this resource as evidence.
	// Null means the resource is evidence on no pull request.
	pullRequest: number | null;
};

export type ResourceRowProps = {
	value: ResourceRowValue;
	// A doc opens the editor, a link opens the in-app browser, an image opens
	// full size, and a file downloads. The page that holds the resource
	// decides which of the four happens.
	onOpen: (id: string) => void;
};

// One resource in the list. The kind word at the left is the only mark that
// separates the four kinds: every row draws the same shape, the same text
// sizes and the same colors, so the reader sorts the list by that one word.
export function ResourceRow({ value, onOpen }: ResourceRowProps) {
	return (
		<li>
			<button
				type="button"
				onClick={() => onOpen(value.id)}
				className={cx(
					"flex h-8 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left transition-colors duration-hover",
					"hover:bg-band focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
					"max-md:h-11 pointer-coarse:h-11",
				)}
			>
				<span className="w-12 shrink-0 text-sm text-fg-faint">{value.kind}</span>
				<span className="min-w-0 flex-1 truncate text-sm text-fg">{value.name}</span>
				<span className="min-w-0 max-w-2/3 shrink truncate text-sm text-fg-muted tabular">
					{value.detail}
					{value.pullRequest !== null && ` · also evidence on #${value.pullRequest}`}
				</span>
			</button>
		</li>
	);
}
