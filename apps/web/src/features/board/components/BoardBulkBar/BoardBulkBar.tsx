import type { TicketSummary } from "@trellis/api";
import { useScopeStatuses } from "../../../../hooks/useScopeStatuses";
import { BulkBar } from "../../../table/BulkBar";
import { labelStates } from "../../../table/utils/labelStates";
import type { BoardBulk } from "../../hooks/useBoardBulk";

export type BoardBulkBarProps = {
	// The selected cards. The bar counts them and every control writes to them.
	rows: readonly TicketSummary[];
	// The project ref of the route. The root of that tree owns the labels and
	// the epics, so a board without a project offers no Labels and no Set epic.
	project?: string;
	bulk: BoardBulk;
	onClear: () => void;
};

// The bulk bar of the board. It draws the same controls as the bulk bar of
// the ticket table, over the cards selected in one board column.
export function BoardBulkBar({ rows, project, bulk, onClear }: BoardBulkBarProps) {
	const statuses = useScopeStatuses(project);
	const rootOfProject = new Map(bulk.projects.map((entry) => [entry.id, entry.rootId]));
	const ticketRootIds = [
		...new Set(rows.map((row) => rootOfProject.get(row.project.id)).filter((id): id is string => id !== undefined)),
	];
	// How the selected cards hold each label: `all` draws a check, `some`
	// draws a minus. A pick on a check removes the label everywhere, and a
	// pick on a minus adds it everywhere.
	const labels = labelStates(rows);
	// The epic the picker marks as current. `epicRefs` holds one entry per
	// distinct epic of the selection, and `null` stands for a card with no
	// epic. Two or more entries mean the selection disagrees, and then the
	// picker marks no row.
	const epicRefs = new Set(rows.map((row) => row.epic?.ref ?? null));
	const epicMixed = epicRefs.size > 1;

	return (
		<>
			<BulkBar
				open={rows.length > 0}
				count={rows.length}
				statuses={statuses}
				projects={bulk.projects}
				ticketRootIds={ticketRootIds}
				project={project}
				labelIds={labels.all}
				mixedLabelIds={labels.some}
				epicRef={epicRefs.size === 1 ? ([...epicRefs][0] ?? undefined) : undefined}
				epicMixed={epicMixed}
				openPicker={rows.length > 0 ? bulk.picker : null}
				onOpenPickerChange={bulk.openPicker}
				onLabel={bulk.label}
				onStatus={bulk.status}
				onPriority={bulk.priority}
				onProject={bulk.project}
				onParent={bulk.parent}
				onEpic={bulk.epic}
				onCopyIds={bulk.copyIds}
				onDelete={bulk.remove}
				onClear={onClear}
			/>
			{bulk.confirmDialog}
		</>
	);
}
