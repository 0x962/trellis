import { ChartBar, DotsThree, PencilSimple, Plus, RowsPlusBottom, Trash } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import { Tooltip } from "@trellis/ui";
import { pageSheetActions } from "../../../../../stores/pageSheetStore";
import { TopbarActionButton, TopbarActionMenu } from "../../../../shell/Topbar";
import type { WaveEditing } from "../../../../table/hooks/useWaveEditing";
import { EpicCreateActions } from "../EpicCreateActions";

// The name and the ref of the open epic. The `epics.get` read answers with
// them, and the bar has neither until it does.
export type EpicTopbarEpic = {
	ref: string;
	name: string;
	// The identifiers of the tickets of the epic, which Add tickets leaves out.
	identifiers: readonly string[];
};

export type EpicTopbarActionsProps = {
	// The project key the Add tickets search stays inside.
	project: string;
	// The epic, or null while the `epics.get` read is on its way.
	epic: EpicTopbarEpic | null;
	// True for an epic under an archived project. The server refuses every
	// write to it.
	readOnly: boolean;
	waveEditing: WaveEditing;
	onAddTicket: (ticket: TicketSummary) => void;
	onEdit: () => void;
	onDelete: () => void;
};

// The four controls on the right of the epic top bar: Statistics, New wave,
// Add tickets and the epic menu. The bar draws all four before the
// `epics.get` read answers, each one disabled, so the loaded bar adds no
// button and the pointer of a person who reaches for one of them lands on
// the button that was there.
export function EpicTopbarActions({
	project,
	epic,
	readOnly,
	waveEditing,
	onAddTicket,
	onEdit,
	onDelete,
}: EpicTopbarActionsProps) {
	return (
		<>
			<Tooltip content="Statistics">
				<TopbarActionButton
					data-bar-slot="statistics"
					label="Statistics"
					icon={<ChartBar />}
					disabled={epic === null}
					onClick={() => epic !== null && pageSheetActions.openStats(epic.ref)}
				/>
			</Tooltip>
			{/* An archived project takes no ticket and no wave, so its bar
			    carries neither button in either state. */}
			{readOnly ? null : epic === null ? (
				<>
					<TopbarActionButton data-bar-slot="new-wave" label="New wave" icon={<RowsPlusBottom />} disabled />
					<TopbarActionButton data-bar-slot="add-tickets" label="Add tickets" icon={<Plus />} disabled />
				</>
			) : (
				<EpicCreateActions
					project={project}
					exclude={epic.identifiers}
					waveEditing={waveEditing}
					onAddTicket={onAddTicket}
				/>
			)}
			{/* Edit and Delete both name the epic, so the menu opens only once
			    the epic has arrived. Until then the same box holds a button
			    that does nothing. */}
			{epic === null ? (
				<TopbarActionButton data-bar-slot="epic-actions" label="Epic actions" icon={<DotsThree />} disabled />
			) : (
				<TopbarActionMenu
					barSlot="epic-actions"
					label={`Actions for ${epic.name}`}
					triggerTooltip="Epic actions"
					items={[
						{ label: "Edit", icon: <PencilSimple />, disabled: readOnly, onSelect: onEdit },
						{ label: "Delete…", icon: <Trash />, danger: true, disabled: readOnly, onSelect: onDelete },
					]}
				/>
			)}
		</>
	);
}
