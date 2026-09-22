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

// The identifiers of one direction, or the words that invite the first pick.
// A waits-on entry carries a status and a question mark that this row does
// not draw, so the list takes the identifier alone.
function Identifiers({ tickets, empty }: { tickets: readonly { identifier: string }[]; empty: string }) {
	if (tickets.length === 0) return <span className="text-fg-muted">{empty}</span>;
	return (
		<span className="flex flex-wrap items-center gap-1">
			{tickets.map((entry, index) => (
				<span key={entry.identifier} className="inline-flex items-center gap-1">
					{index > 0 && <span className="text-fg-faint">·</span>}
					<TicketId id={entry.identifier} size="sm" />
				</span>
			))}
		</span>
	);
}

// The two directions of the dependency chain, one row each. Waits on lists
// the tickets that hold this ticket back. Blocks lists the tickets that this
// ticket holds back. One edge joins both rows, so a pick in either row writes
// the same kind of record and the other row shows it at once.
//
// Each pick writes one edge and leaves the picker open for another pick. The
// server drops a ticket that is done from both lists.
export function DependenciesRow({ ticket }: DependenciesRowProps) {
	const { client, orpc, queryClient } = useApp();
	const { write } = useTicketWrite(ticket.identifier);
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);

	const refreshSearch = () => queryClient.invalidateQueries({ queryKey: orpc.search.key() });

	const toggleWaitsOn = async (dependency: TicketSummary, next: boolean) => {
		const change = next ? { after: [dependency.identifier] } : { notAfter: [dependency.identifier] };
		try {
			await write((used) => used.tickets.updateDependencies({ ticket: ticket.identifier, ...change }));
			await refreshSearch();
		} catch (error) {
			failToast(
				`The dependencies of ${ticket.identifier} did not change.`,
				error,
				() => void toggleWaitsOn(dependency, next),
			);
		}
	};

	// This row writes the edge on the other ticket, because a ticket stores
	// only the tickets it waits on. The write therefore takes no optimistic
	// row here; the reread of this ticket brings the new Blocks list.
	const toggleBlocks = async (released: TicketSummary, next: boolean) => {
		const change = next ? { after: [ticket.identifier] } : { notAfter: [ticket.identifier] };
		try {
			await client.tickets.updateDependencies({ ticket: released.identifier, ...change });
			await queryClient.invalidateQueries({ queryKey: orpc.tickets.get.key() });
			await refreshSearch();
		} catch (error) {
			failToast(
				`The dependencies of ${released.identifier} did not change.`,
				error,
				() => void toggleBlocks(released, next),
			);
		}
	};

	return (
		<>
			<PropertyRow compact align="start" label="Waits on">
				<TicketPicker
					project={ticket.project.key}
					exclude={[ticket.identifier]}
					isChecked={(candidate) => candidate.releases.some((release) => release.identifier === ticket.identifier)}
					onToggle={(dependency, next) => void toggleWaitsOn(dependency, next)}
					allowNone={false}
					label="Waits on"
					placeholder="Set the tickets this one waits on: an identifier or a title"
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<Identifiers tickets={ticket.waitsOn} empty="Add dependency" />
						</Button>
					}
					open={open === "dependencies"}
					onOpenChange={(next) => setOpen(next ? "dependencies" : null)}
				/>
			</PropertyRow>
			<PropertyRow compact align="start" label="Blocks">
				<TicketPicker
					project={ticket.project.key}
					exclude={[ticket.identifier]}
					isChecked={(candidate) => candidate.waitsOn.some((dependency) => dependency.identifier === ticket.identifier)}
					onToggle={(released, next) => void toggleBlocks(released, next)}
					allowNone={false}
					label="Blocks"
					placeholder="Set the tickets this one blocks: an identifier or a title"
					trigger={
						<Button variant="quiet" className={triggerClass}>
							<Identifiers tickets={ticket.releases} empty="Add blocked ticket" />
						</Button>
					}
					open={open === "blocks"}
					onOpenChange={(next) => setOpen(next ? "blocks" : null)}
				/>
			</PropertyRow>
		</>
	);
}
