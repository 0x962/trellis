import { MagnifyingGlass } from "@phosphor-icons/react";
import { Command as Cmdk } from "cmdk";
import type { KeyboardEventHandler, ReactNode, RefObject } from "react";
import { Kbd } from "../../../Kbd";

export type CommandFieldProps = {
	placeholder?: string;
	label?: string;
	inputRef?: RefObject<HTMLInputElement | null>;
	// The ticket the list acts on. It is pinned before the field in place
	// of the search icon.
	context?: string;
	leading?: ReactNode;
	value?: string;
	onValueChange?: (value: string) => void;
	onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
	autoFocus?: boolean;
};

// The search field of a Command, with the pinned context and the esc cap.
export function CommandField({
	placeholder = "Search tickets",
	context,
	label,
	inputRef,
	leading,
	value,
	onValueChange,
	onKeyDown,
	autoFocus,
}: CommandFieldProps) {
	return (
		<div className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-b border-border px-3 [@media(pointer:coarse)]:h-12">
			{leading}
			{context === undefined ? (
				<MagnifyingGlass className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
			) : (
				<span
					data-command-context=""
					className="inline-flex h-5 shrink-0 items-center rounded-sm border border-border bg-surface px-1.5 font-mono text-xs text-fg-muted"
				>
					{context}
				</span>
			)}
			<Cmdk.Input
				ref={inputRef}
				aria-label={label}
				placeholder={placeholder}
				value={value}
				onValueChange={onValueChange}
				onKeyDown={onKeyDown}
				autoFocus={autoFocus}
				className="h-full min-w-0 flex-1 rounded-sm bg-transparent text-md text-fg outline-none placeholder:text-fg-faint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent max-md:text-base"
			/>
			<Kbd className="shrink-0">esc</Kbd>
		</div>
	);
}
