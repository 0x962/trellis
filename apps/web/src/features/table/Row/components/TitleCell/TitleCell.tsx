import { Paperclip, TextAlignLeft } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { formatCount } from "../../../../../lib/format";

export type TitleCellProps = {
	ticket: TicketSummary;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// The title on one line, then the muted marks: the parent, the sub-ticket
// ring, the attachment count, and the comment count. A long title
// truncates, so the row keeps its height.
//
// A done or canceled ticket prints its title alone. Its work is over, so
// the marks say nothing a person acts on, and the row reads as one quiet
// line. The caret that shows and hides its pull request lines is not here:
// `Row` draws it in the track at the right end of the row.
export function TitleCell({ ticket }: TitleCellProps) {
	const { parent, childCount, childDoneCount, attachmentCount, commentCount } = ticket;
	const progress = childCount === 0 ? 0 : childDoneCount / childCount;
	if (ticket.status.category === "done" || ticket.status.category === "canceled") {
		return <span className="truncate text-fg">{ticket.title}</span>;
	}
	return (
		<span className="flex min-w-0 items-center gap-2">
			<span className="truncate text-fg">{ticket.title}</span>
			{parent !== null && (
				<span
					role="img"
					aria-label={`Parent ${parent.identifier}`}
					className="shrink-0 font-mono text-xs text-fg-muted"
				>
					↳ {parent.identifier}
				</span>
			)}
			{childCount > 0 && (
				<span
					role="img"
					aria-label={`${childDoneCount} of ${childCount} sub-tickets done`}
					className="inline-flex shrink-0 items-center gap-1 text-xs text-fg-muted tabular"
				>
					<span
						aria-hidden="true"
						style={{ "--progress": `${Math.round(progress * 100)}%` } as Record<string, string>}
						className="inline-grid size-3.5 place-items-center rounded-sm bg-[conic-gradient(var(--color-success)_var(--progress),var(--color-border)_0)] after:size-2 after:rounded-sm after:bg-surface after:content-['']"
					/>
					{childDoneCount}/{childCount}
				</span>
			)}
			{attachmentCount > 0 && (
				<span
					role="img"
					aria-label={plural(attachmentCount, "attachment")}
					className="inline-flex shrink-0 items-center gap-0.5 text-xs text-fg-muted tabular"
				>
					<Paperclip aria-hidden="true" className="size-2.75" />
					{formatCount(attachmentCount)}
				</span>
			)}
			{commentCount > 0 && (
				<a
					href={`/t/${ticket.identifier}#comments`}
					aria-label={plural(commentCount, "comment")}
					className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-xs text-fg-muted tabular hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
					onClick={(event) => event.stopPropagation()}
				>
					<TextAlignLeft aria-hidden="true" className="size-2.75" />
					{formatCount(commentCount)}
				</a>
			)}
		</span>
	);
}
