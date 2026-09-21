import type { StatusSummary } from "@trellis/api";
import { cx, StatusIcon } from "@trellis/ui";
import type { RefObject } from "react";
import { StatusPicker } from "../../../../pickers/StatusPicker";
import { statusIconProps } from "../../../../statusIconProps";
import { cellButtonClass } from "../../cellButtonClass";

export type StatusCellProps = {
	status: StatusSummary;
	// The statuses of the scope. The picker lists them.
	statuses: readonly StatusSummary[];
	// The share of sub-tickets that are done, for a started status.
	progress?: number;
	// True when the cell keeps the status icon and hides the status name.
	// An epic table sets this, because the `waits` cell and the pull request
	// lines already show the state of the work.
	iconOnly?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (status: StatusSummary) => void;
	finalFocus: RefObject<HTMLElement | null>;
};

// The status icon and name, which open the picker on click or on `s`.
// Under 768 px the name is for assistive tech only: the group header above
// the rows names the status, and the title needs the room. `iconOnly`
// takes the name out at every width.
export function StatusCell({
	status,
	statuses,
	progress,
	iconOnly = false,
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
					<StatusIcon {...statusIconProps(status)} progress={progress} />
					<span className={cx("truncate text-sm text-fg-muted max-md:sr-only", iconOnly && "sr-only")}>
						{status.name}
					</span>
				</button>
			}
		/>
	);
}
