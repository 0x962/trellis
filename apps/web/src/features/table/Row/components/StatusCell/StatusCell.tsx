import type { StatusSummary } from "@trellis/api";
import { cx, StatusIcon } from "@trellis/ui";
import type { RefObject } from "react";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { cellButtonClass } from "../../cellButtonClass";

export type StatusCellProps = {
	status: StatusSummary;
	// The statuses of the scope. The picker lists them.
	statuses: readonly StatusSummary[];
	// The share of sub-tickets that are done, for a started status.
	progress?: number;
	// True where the row says the state of the work in other cells. The name
	// then reads for assistive tech alone and the cell keeps the icon.
	glyphOnly?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (status: StatusSummary) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

// The status icon and name, which open the picker on click or on `s`.
// Under 768 px the name is for assistive tech only: the group header above
// the rows names the status, and the title needs the room. `glyphOnly`
// takes the name out at every width.
export function StatusCell({
	status,
	statuses,
	progress,
	glyphOnly = false,
	open,
	onOpenChange,
	onPick,
	finalFocus,
}: StatusCellProps) {
	return (
		<StatusPicker
			statuses={statuses}
			value={status.id}
			open={open}
			onOpenChange={onOpenChange}
			onPick={onPick}
			finalFocus={finalFocus}
			trigger={
				<button type="button" aria-label={`Status: ${status.name}`} className={cellButtonClass}>
					<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} progress={progress} />
					<span className={cx("truncate text-sm text-fg-muted max-md:sr-only", glyphOnly && "sr-only")}>
						{status.name}
					</span>
				</button>
			}
		/>
	);
}
