import type { Ticket, TicketSummary } from "@trellis/api";
import { Button, PropertyRow, TicketId } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import { failToast } from "../../../../../lib/failToast";
import { TicketPicker } from "../../../../pickers/TicketPicker";
import { useTicketWrite } from "../../../hooks/useTicketWrite";
import { usePickerStore } from "../../../stores/pickerStore";

export type DependenciesRowProps = {
	ticket: Ticket;
};

const triggerClass = "-ml-2 h-auto max-w-full min-h-7 justify-start py-1 font-normal whitespace-normal";

// The picker toggles the tickets that hold this ticket back. Each pick writes
// one dependency edge and leaves the picker open for another pick.
export function DependenciesRow({ ticket }: DependenciesRowProps) {
	const { orpc, queryClient } = useApp();
	const { write } = useTicketWrite(ticket.identifier);
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);

	const toggle = async (dependency: TicketSummary, next: boolean) => {
		const change = next ? { after: [dependency.identifier] } : { notAfter: [dependency.identifier] };
		try {
			await write((client) => client.tickets.updateDependencies({ ticket: ticket.identifier, ...change }));
			await queryClient.invalidateQueries({ queryKey: orpc.search.key() });
		} catch (error) {
			failToast(`The dependencies of ${ticket.identifier} did not change.`, error, () => void toggle(dependency, next));
		}
	};

	return (
		<PropertyRow compact align="start" label="Waits on">
			<TicketPicker
				project={ticket.project.key}
				exclude={[ticket.identifier]}
				isChecked={(dependency) => dependency.releases.some((release) => release.identifier === ticket.identifier)}
				onToggle={(dependency, next) => void toggle(dependency, next)}
				allowNone={false}
				label="Dependencies"
				placeholder="Set dependencies: an identifier or a title"
				trigger={
					<Button variant="quiet" className={triggerClass}>
						{ticket.waitsOn.length === 0 ? (
							<span className="text-fg-muted">Add dependency</span>
						) : (
							<span className="flex flex-wrap items-center gap-1">
								{ticket.waitsOn.map((dependency, index) => (
									<span key={dependency.identifier} className="inline-flex items-center gap-1">
										{index > 0 && <span className="text-fg-faint">·</span>}
										<TicketId id={dependency.identifier} size="sm" />
									</span>
								))}
							</span>
						)}
					</Button>
				}
				open={open === "dependencies"}
				onOpenChange={(next) => setOpen(next ? "dependencies" : null)}
			/>
		</PropertyRow>
	);
}
