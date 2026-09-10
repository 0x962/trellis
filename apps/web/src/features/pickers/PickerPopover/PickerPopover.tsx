import { cx, Input, Popover } from "@trellis/ui";
import { type KeyboardEvent, type ReactElement, type ReactNode, useEffect, useState } from "react";

export type PickerOption = {
	id: string;
	label: string;
	// Mono text after the label, such as a project name or a ticket title.
	hint?: string;
	icon?: ReactNode;
	// Options with the same group sit under one heading, in first-seen order.
	group?: string;
	// Extra words the filter matches.
	keywords?: string[];
};

export type PickerPopoverProps = {
	trigger: ReactElement;
	// The accessible name of the option list.
	label: string;
	options: readonly PickerOption[];
	selectedId?: string;
	onPick: (id: string) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	placeholder: string;
	// When set, the typed text goes to the caller and the options arrive
	// filtered. Otherwise the picker filters the options itself.
	onQueryChange?: (query: string) => void;
	// A reason the last pick was refused, shown under the list.
	error?: string | null;
};

const matches = (option: PickerOption, query: string) => {
	const needle = query.trim().toLowerCase();
	if (needle === "") return true;
	return [option.label, option.hint ?? "", ...(option.keywords ?? [])].some((text) =>
		text.toLowerCase().includes(needle),
	);
};

// A popover with a filter field and a list of options. Arrow keys move the
// highlight, Enter picks it, Escape closes. The same picker serves the
// rail, the table, and the palette.
export function PickerPopover({
	trigger,
	label,
	options,
	selectedId,
	onPick,
	open,
	onOpenChange,
	placeholder,
	onQueryChange,
	error,
}: PickerPopoverProps) {
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	const shown = onQueryChange === undefined ? options.filter((option) => matches(option, query)) : options;

	useEffect(() => {
		if (!open) {
			setQuery("");
			setHighlight(0);
		}
	}, [open]);

	const change = (value: string) => {
		setQuery(value);
		setHighlight(0);
		onQueryChange?.(value);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setHighlight((index) => Math.min(index + 1, shown.length - 1));
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			setHighlight((index) => Math.max(index - 1, 0));
		} else if (event.key === "Enter") {
			event.preventDefault();
			const option = shown[highlight];
			if (option !== undefined) onPick(option.id);
		}
	};

	let lastGroup: string | undefined;
	return (
		<Popover trigger={trigger} open={open} onOpenChange={onOpenChange} className="w-64 p-1">
			<div className="p-1">
				<Input
					label="Filter"
					hideLabel
					autoFocus
					placeholder={placeholder}
					value={query}
					onChange={(event) => change(event.target.value)}
					onKeyDown={onKeyDown}
				/>
			</div>
			<div role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
				{shown.length === 0 && <div className="px-2 py-3 text-center text-sm text-fg-muted">No match</div>}
				{shown.map((option, index) => {
					const heading = option.group !== undefined && option.group !== lastGroup ? option.group : null;
					lastGroup = option.group;
					return (
						<Option
							key={option.id}
							option={option}
							heading={heading}
							selected={option.id === selectedId}
							highlighted={index === highlight}
							onPick={onPick}
							onHover={() => setHighlight(index)}
						/>
					);
				})}
			</div>
			{error !== undefined && error !== null && (
				<p role="alert" className="mx-1 mt-1 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
					{error}
				</p>
			)}
		</Popover>
	);
}

type OptionProps = {
	option: PickerOption;
	heading: string | null;
	selected: boolean;
	highlighted: boolean;
	onPick: (id: string) => void;
	onHover: () => void;
};

function Option({ option, heading, selected, highlighted, onPick, onHover }: OptionProps) {
	return (
		<>
			{heading !== null && (
				<div role="presentation" className="px-2 pt-2 pb-1 text-xs font-medium text-fg-faint select-none">
					{heading}
				</div>
			)}
			<button
				type="button"
				role="option"
				aria-selected={selected}
				tabIndex={highlighted ? 0 : -1}
				data-highlighted={highlighted || undefined}
				onMouseEnter={onHover}
				onClick={() => onPick(option.id)}
				className={cx(
					"flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm text-fg select-none",
					highlighted && "bg-bg",
				)}
			>
				{option.icon !== undefined && (
					<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 items-center justify-center *:size-full">
						{option.icon}
					</span>
				)}
				<span className="truncate">{option.label}</span>
				{option.hint !== undefined && (
					<span className="ml-auto truncate font-mono text-xs text-fg-faint">{option.hint}</span>
				)}
			</button>
		</>
	);
}
