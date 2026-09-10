import { Command as Cmdk } from "cmdk";
import { Search } from "lucide-react";
import type { KeyboardEventHandler } from "react";
import { Kbd } from "../../../Kbd";

export type CommandFieldProps = {
	placeholder?: string;
	// The ticket the list acts on. It is pinned before the field in place
	// of the search icon.
	context?: string;
	value?: string;
	onValueChange?: (value: string) => void;
	onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
	autoFocus?: boolean;
};

// The search field of a Command, with the pinned context and the esc cap.
export function CommandField({
	placeholder = "Search tickets",
	context,
	value,
	onValueChange,
	onKeyDown,
	autoFocus,
}: CommandFieldProps) {
	return (
		<div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
			{context === undefined ? (
				<Search className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
			) : (
				<span
					data-command-context=""
					className="inline-flex h-5 shrink-0 items-center rounded-sm border border-border bg-surface px-1.5 font-mono text-xs text-fg-muted"
				>
					{context}
				</span>
			)}
			<Cmdk.Input
				placeholder={placeholder}
				value={value}
				onValueChange={onValueChange}
				onKeyDown={onKeyDown}
				autoFocus={autoFocus}
				className="h-full flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-faint"
			/>
			<Kbd className="shrink-0">esc</Kbd>
		</div>
	);
}
