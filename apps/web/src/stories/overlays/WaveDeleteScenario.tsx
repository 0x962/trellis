import { Trash } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { useWaveEditing } from "../../features/table/hooks/useWaveEditing";
import { epic, tickets, wave } from "./fixtures";
export function WaveDeleteScenario({ assigned = false }: { assigned?: boolean }) {
	const editing = useWaveEditing({
		epicRef: epic.ref,
		waves: [wave],
		tickets,
		assignedTicketIds: new Set(assigned ? [tickets[0]!.id] : []),
	});
	return (
		<>
			<Tooltip content="Delete wave">
				<IconButton label="Delete wave" icon={<Trash />} onClick={() => editing.requestDelete(wave.id)} />
			</Tooltip>
			{editing.element}
		</>
	);
}
