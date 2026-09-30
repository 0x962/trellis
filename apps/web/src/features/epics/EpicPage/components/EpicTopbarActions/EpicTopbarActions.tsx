import { DotsThree, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { TicketSummary } from "@trellis/api";
import type { MenuItem } from "@trellis/ui";
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
	shareItems: readonly MenuItem[];
	onAddTicket: (ticket: TicketSummary) => void;
	onEdit: () => void;
	onDelete: () => void;
};

// The Add and epic action controls keep their positions while the epic loads.
export function EpicTopbarActions({
	project,
	epic,
	readOnly,
	waveEditing,
	shareItems,
	onAddTicket,
	onEdit,
	onDelete,
}: EpicTopbarActionsProps) {
	return (
		<>
			{readOnly ? null : epic === null ? (
				<TopbarActionButton data-bar-slot="add" label="Add" icon={<Plus />} disabled />
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
						...shareItems,
						{ label: "Edit", icon: <PencilSimple />, disabled: readOnly, onSelect: onEdit },
						{ label: "Delete…", icon: <Trash />, danger: true, disabled: readOnly, onSelect: onDelete },
					]}
				/>
			)}
		</>
	);
}
