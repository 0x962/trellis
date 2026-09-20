import type { TicketSummary } from "@trellis/api";
import { useScopeStatuses } from "../../../../hooks/useScopeStatuses";
import { BulkBar } from "../../../table/BulkBar";
import { epicState } from "../../../table/utils/epicState";
import { labelStates } from "../../../table/utils/labelStates";
import type { BoardBulk } from "../../hooks/useBoardBulk";

export type BoardBulkBarProps = {
	// The selected cards. The bar counts them and every control writes to them.
	rows: readonly TicketSummary[];
	// The project ref of the route. The root of that tree owns the labels and
	// the epics, so a board without a project offers no Labels, no Set epic, and
	// no Set wave.
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
	// The epic and the milestone each picker marks as current. The pickers
	// mark no row when the selected cards disagree.
	const epics = epicState(rows);

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
				{...epics}
				openPicker={rows.length > 0 ? bulk.picker : null}
				onOpenPickerChange={bulk.openPicker}
				onLabel={bulk.label}
				onStatus={bulk.status}
				onPriority={bulk.priority}
				onProject={bulk.project}
				onParent={bulk.parent}
				onEpic={bulk.epic}
				onMilestone={bulk.milestone}
				onCopyIds={bulk.copyIds}
				onDelete={bulk.remove}
				onClear={onClear}
			/>
			{bulk.confirmDialog}
		</>
	);
}
