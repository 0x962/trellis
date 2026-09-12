import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import type { ReactElement, ReactNode } from "react";
import { formatCount } from "../../../../lib/format";
import { InboxRow } from "../InboxRow";

export type InboxSectionProps = {
	name: string;
	// Every row the server holds for the section, which can be more than the
	// 100 rows `rows` carries.
	total: number;
	icon?: ReactElement;
	// The muted text on the right of the header, such as the rule the
	// section follows.
	hint?: ReactNode;
	open: boolean;
	onToggle: () => void;
	rows: TicketSummary[];
	// True shows the status column on every row.
	showStatus?: boolean;
};

// The frame every Needs you section shares: a band header that opens and
// closes the section, and the rows under it. Each row links to its ticket.
export function InboxSection({ name, total, icon, hint, open, onToggle, rows, showStatus = false }: InboxSectionProps) {
	const Chevron = open ? CaretDown : CaretRight;
	return (
		<section aria-label={name}>
			<button
				type="button"
				aria-expanded={open}
				onClick={onToggle}
				className={cx(
					"flex h-8 w-full items-center gap-2 border-b border-border bg-band px-5 text-left pointer-coarse:h-11",
					"transition-colors duration-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
				)}
			>
				<Chevron aria-hidden="true" className="size-3 shrink-0 text-fg-faint" />
				{icon !== undefined && (
					<span aria-hidden="true" className="inline-flex size-3.5 shrink-0 *:size-full">
						{icon}
					</span>
				)}
				<span className="text-sm font-medium text-fg-muted">{name}</span>
				<span className="text-sm text-fg-faint tabular">{formatCount(total)}</span>
				{hint !== undefined && <span className="ml-auto flex items-center gap-1.5 text-sm text-fg-faint">{hint}</span>}
			</button>
			{open && rows.map((ticket) => <InboxRow key={ticket.id} ticket={ticket} showStatus={showStatus} />)}
		</section>
	);
}
