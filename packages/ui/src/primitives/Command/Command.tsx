import { Command as Cmdk } from "cmdk";
import { Search } from "lucide-react";
import { cx } from "../../utils/cx";
import { CommandDialog } from "./components/CommandDialog";

export type CommandItem = {
	// The value `onSelect` receives, such as a ticket identifier.
	id: string;
	label: string;
	// Extra words the filter matches. The default is the id.
	keywords?: string[];
	// Short mono text after the label, such as the identifier. It is drawn by
	// CSS, so the option's text stays the label alone.
	hint?: string;
};

export type CommandProps = {
	items: readonly CommandItem[];
	onSelect: (id: string) => void;
	placeholder?: string;
	// The accessible name of the search field.
	label?: string;
	className?: string;
};

// A filterable list with one search field. Typing narrows the options, arrow
// keys move the selection, Enter picks it. `Command.Dialog` puts it in the
// Cmd-K panel. Each option stays a direct child of the list: cmdk reorders
// the options in the DOM by rank and moves only those children.
export function Command({
	items,
	onSelect,
	placeholder = "Search tickets",
	label = "Search",
	className,
}: CommandProps) {
	return (
		<Cmdk label={label} className={cx("flex flex-col text-base text-fg", className)}>
			<div className="flex h-11 items-center gap-2 border-b border-border px-3">
				<Search className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
				<Cmdk.Input
					placeholder={placeholder}
					className="h-full flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-faint"
				/>
			</div>
			<Cmdk.List className="max-h-80 overflow-y-auto p-1">
				<Cmdk.Empty className="px-2 py-6 text-center text-sm text-fg-muted">No results.</Cmdk.Empty>
				{items.map((item) => (
					<Cmdk.Item
						key={item.id}
						value={item.label}
						keywords={item.keywords ?? [item.id]}
						onSelect={() => onSelect(item.id)}
						data-hint={item.hint}
						className={cx(
							"flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-base text-fg outline-none select-none data-[selected=true]:bg-bg",
							"after:ml-auto after:font-mono after:text-xs after:text-fg-faint after:content-[attr(data-hint)] after:tabular",
						)}
					>
						{item.label}
					</Cmdk.Item>
				))}
			</Cmdk.List>
		</Cmdk>
	);
}

Command.Dialog = CommandDialog;
