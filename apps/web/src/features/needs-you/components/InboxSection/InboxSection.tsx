import type { TicketSummary } from "@trellis/api";
import { cx } from "@trellis/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { formatCount } from "../../../../lib/format";
import { useActiveRow } from "../../providers/ActiveRowProvider";
import { InboxRow } from "../InboxRow";

export type InboxSectionProps = {
	name: string;
	// Every row the server holds for the section, which can be more than the
	// 100 rows `items` carries.
	total: number;
	icon?: ReactElement;
	// The muted text on the right of the header, such as the rule the
	// section follows.
	hint?: ReactNode;
	open: boolean;
	onToggle: () => void;
	rows: TicketSummary[];
	// The identifier of the row that holds the tab stop.
	focusedId?: string | null;
	// True shows the status column on every row.
	showStatus?: boolean;
	renderActions?: (ticket: TicketSummary) => ReactNode;
	renderMeta?: (ticket: TicketSummary) => ReactNode;
	renderPanel?: (ticket: TicketSummary) => ReactNode;
	isSweeping?: (ticket: TicketSummary) => boolean;
	// Runs when a row takes the focus or the pointer, so the tab stop follows
	// the person.
	onRowActive?: (ticket: TicketSummary) => void;
};

// The frame every Needs you section shares: a band header that opens and
// closes the section, and a grid of rows with one tab stop. `j` and `k` walk
// the rows; Tab leaves the section. The pointer or the focus on a row also
// makes it the active row of the page.
export function InboxSection({
	name,
	total,
	icon,
	hint,
	open,
	onToggle,
	rows,
	focusedId,
	showStatus = false,
	renderActions,
	renderMeta,
	renderPanel,
	isSweeping,
	onRowActive,
}: InboxSectionProps) {
	const { activeId, setActiveId } = useActiveRow();
	const current = focusedId ?? rows[0]?.identifier;
	const activate = (target: EventTarget) => {
		if (!(target instanceof HTMLElement)) return;
		const identifier = target.closest("[data-inbox-row]")?.getAttribute("data-inbox-row");
		const ticket = rows.find((row) => row.identifier === identifier);
		if (ticket === undefined) return;
		setActiveId(ticket.identifier);
		onRowActive?.(ticket);
	};
	const Chevron = open ? ChevronDown : ChevronRight;

	return (
		<section aria-label={name}>
			<button
				type="button"
				aria-expanded={open}
				onClick={onToggle}
				className={cx(
					"flex h-8 w-full items-center gap-2 border-y border-border bg-band px-5 text-left",
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
			{open && (
				<table
					// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a table of rows the keyboard walks is a grid, and ARIA names a table as the element to carry that role.
					role="grid"
					aria-label={name}
					className="w-full table-fixed border-collapse"
					onFocusCapture={(event) => activate(event.target)}
					onPointerOver={(event) => activate(event.target)}
				>
					<tbody className="flex w-full flex-col">
						{rows.map((ticket) => {
							// A leaving row is out of the section already: it holds no tab
							// stop and offers no action.
							const sweeping = isSweeping?.(ticket) ?? false;
							return (
								<InboxRow
									key={ticket.id}
									ticket={ticket}
									tabIndex={ticket.identifier === current && !sweeping ? 0 : -1}
									active={ticket.identifier === activeId && !sweeping}
									showStatus={showStatus}
									actions={sweeping ? undefined : renderActions?.(ticket)}
									meta={sweeping ? undefined : renderMeta?.(ticket)}
									panel={sweeping ? undefined : renderPanel?.(ticket)}
									sweeping={sweeping}
								/>
							);
						})}
					</tbody>
				</table>
			)}
		</section>
	);
}
