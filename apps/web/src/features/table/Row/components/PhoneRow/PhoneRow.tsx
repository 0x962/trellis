import type { TicketSummary } from "@trellis/api";
import { cx, StatusIcon } from "@trellis/ui";
import type { MouseEvent, ReactNode, Ref } from "react";
import { compactRelativeTime } from "../../../../../lib/format";
import { phoneRowHeight } from "../../../rowHeights";

export type PhoneRowProps = {
	ref: Ref<HTMLDivElement>;
	ticket: TicketSummary;
	// The priority cell of the row, with its picker.
	priority: ReactNode;
	// The offset inside the virtual body.
	top?: number;
	group?: string;
	focused: boolean;
	selected: boolean;
	onFocus?: (id: string) => void;
	onClick?: (id: string, event: MouseEvent) => void;
};

// One ticket below 768 px: priority, ID, status icon, and time on the first
// line, and the title on the second. The PR, actor, and project cells do
// not show; the row keeps the grid roles, the roving tab stop, and the
// focus and selection states of the wide row.
export function PhoneRow({ ref, ticket, priority, top, group, focused, selected, onFocus, onClick }: PhoneRowProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements lint/a11y/useKeyWithClickEvents: The virtual grid positions each row, and the table keyboard map provides every row action.
		<div
			ref={ref}
			role="row"
			tabIndex={focused ? 0 : -1}
			aria-selected={selected}
			data-identifier={ticket.identifier}
			data-group={group}
			data-focused={focused ? "" : undefined}
			data-selected={selected ? "" : undefined}
			style={{
				height: `${phoneRowHeight}px`,
				transform: top === undefined ? undefined : `translateY(${top}px)`,
			}}
			className={cx(
				"absolute top-0 left-0 flex w-full flex-col justify-center gap-1 border-b border-border px-4 outline-none",
				"data-focused:bg-accent-soft/60 data-selected:bg-accent-soft",
				top === undefined && "relative",
			)}
			onFocus={(event) => {
				if (event.target === event.currentTarget) onFocus?.(ticket.id);
			}}
			onClick={(event) => onClick?.(ticket.id, event)}
		>
			<div className="flex items-center gap-3">
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="priority" className="flex items-center">
					{priority}
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="id" className="font-mono text-sm whitespace-nowrap text-fg-faint tabular">
					{ticket.identifier}
				</div>
				<span className="flex-1" />
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="status" className="flex items-center">
					<StatusIcon
						category={ticket.status.category}
						reviewer={ticket.status.reviewer ?? undefined}
						label={ticket.status.name}
					/>
				</div>
				{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
				<div role="gridcell" data-column="updated" className="text-xs text-fg-faint tabular">
					{compactRelativeTime(ticket.updatedAt)}
				</div>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements lint/a11y/useFocusableInteractive: The row owns the grid focus, so its cells stay outside the tab order. */}
			<div role="gridcell" data-column="title" data-line="title" className="truncate text-sm text-fg">
				{ticket.title}
			</div>
		</div>
	);
}
