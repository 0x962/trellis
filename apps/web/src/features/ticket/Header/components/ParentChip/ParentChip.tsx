import type { Ticket } from "@trellis/api";
import { useOpenTicket } from "../../../hooks/useOpenTicket";

export type ParentChipProps = {
	parent: NonNullable<Ticket["parent"]>;
	title: string;
};

// The parent as a chip: its identifier and its title, cut to the chip's
// width. A click opens the parent in the same surface.
export function ParentChip({ parent, title }: ParentChipProps) {
	const open = useOpenTicket();
	return (
		<button
			type="button"
			onClick={() => open(parent.identifier)}
			className="inline-flex h-7 min-w-0 max-w-60 shrink items-center gap-1.5 rounded-sm border border-border bg-surface px-1.5 text-xs text-fg-muted transition duration-hover hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
		>
			<span className="shrink-0 font-mono text-kbd">{parent.identifier}</span>
			<span className="truncate">{title}</span>
		</button>
	);
}
