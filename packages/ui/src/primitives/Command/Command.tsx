import { Command as Cmdk } from "cmdk";
import { Check, Search } from "lucide-react";
import type { ReactElement, ReactNode, RefObject } from "react";
import { cx } from "../../utils/cx";
import { CommandDialog } from "./components/CommandDialog";

export type CommandItem = {
	// The value `onSelect` receives, such as a ticket identifier. It is also
	// the option's identity in the list, so two items with one label stay two
	// options. The filter matches it.
	id: string;
	label: string;
	// Extra words the filter matches, beside the id and the label.
	keywords?: string[];
	// Short mono text after the label, such as the identifier. It is drawn by
	// CSS, so the option's text stays the label alone.
	hint?: string;
	// A lucide icon or a domain mark, shown at 14 px before the label.
	icon?: ReactElement;
	// The value the field holds now. The option carries `data-current`.
	current?: boolean;
	// One value of a multi-value set. A checked option shows a check mark and
	// carries `data-checked="true"`.
	checked?: boolean;
	// The depth of a tree row. Each level indents 12 px.
	depth?: number;
	// Extra content after the label, such as an identifier the text must carry.
	children?: ReactNode;
};

export type CommandGroup = {
	heading: string;
	// A mark before the heading, such as the category icon.
	icon?: ReactElement;
	items: readonly CommandItem[];
};

export type CommandProps = {
	items?: readonly CommandItem[];
	// Items under headings. Groups render after the plain items.
	groups?: readonly CommandGroup[];
	onSelect: (id: string) => void;
	placeholder?: string;
	// The accessible name of the search field.
	label?: string;
	// The search field takes focus on mount.
	autoFocus?: boolean;
	// The search field, for a popover that moves focus to it on open.
	inputRef?: RefObject<HTMLInputElement | null>;
	// False when a server does the search: every item renders and
	// `onSearchChange` reports the text.
	filter?: boolean;
	onSearchChange?: (search: string) => void;
	empty?: string;
	className?: string;
};

const indents = ["pl-2", "pl-5", "pl-8", "pl-11"] as const;

// A filterable list with one search field. Typing narrows the options, arrow
// keys move the selection, Enter picks it. `Command.Dialog` puts it in the
// Cmd-K panel. Each option stays a direct child of its list or group: cmdk
// reorders the options in the DOM by rank and moves only those children.
export function Command({
	items = [],
	groups = [],
	onSelect,
	placeholder = "Search tickets",
	label = "Search",
	autoFocus = false,
	inputRef,
	filter = true,
	onSearchChange,
	empty = "No results.",
	className,
}: CommandProps) {
	const option = (item: CommandItem) => (
		<Cmdk.Item
			key={item.id}
			value={item.id}
			keywords={[item.label, ...(item.keywords ?? [])]}
			onSelect={() => onSelect(item.id)}
			data-hint={item.hint}
			data-current={item.current ? "true" : undefined}
			data-checked={item.checked === undefined ? undefined : String(item.checked)}
			data-depth={item.depth}
			className={cx(
				"flex h-8 cursor-default items-center gap-2 rounded-sm pr-2 text-base text-fg outline-none select-none data-[selected=true]:bg-bg",
				indents[Math.min(item.depth ?? 0, indents.length - 1)],
				"after:ml-auto after:font-mono after:text-xs after:text-fg-faint after:content-[attr(data-hint)] after:tabular",
			)}
		>
			{item.icon && <span className="inline-flex size-3.5 shrink-0 *:size-full">{item.icon}</span>}
			{item.label}
			{item.children}
			{item.checked && <Check aria-hidden="true" className="size-3.5 shrink-0 text-accent" />}
		</Cmdk.Item>
	);
	return (
		<Cmdk label={label} shouldFilter={filter} className={cx("flex flex-col text-base text-fg", className)}>
			<div className="flex h-11 items-center gap-2 border-b border-border px-3">
				<Search className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
				<Cmdk.Input
					ref={inputRef}
					placeholder={placeholder}
					aria-label={label}
					autoFocus={autoFocus}
					onValueChange={onSearchChange}
					className="h-full flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-faint"
				/>
			</div>
			<Cmdk.List className="max-h-80 overflow-y-auto p-1">
				<Cmdk.Empty className="px-2 py-6 text-center text-sm text-fg-muted">{empty}</Cmdk.Empty>
				{items.map(option)}
				{groups.map((group) => (
					<Cmdk.Group
						key={group.heading}
						heading={
							<span className="inline-flex items-center gap-1.5">
								{group.icon && (
									<span aria-hidden="true" className="inline-flex size-3 shrink-0 *:size-full">
										{group.icon}
									</span>
								)}
								{group.heading}
							</span>
						}
						className="[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-7 [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-faint"
					>
						{group.items.map(option)}
					</Cmdk.Group>
				))}
			</Cmdk.List>
		</Cmdk>
	);
}

Command.Dialog = CommandDialog;
