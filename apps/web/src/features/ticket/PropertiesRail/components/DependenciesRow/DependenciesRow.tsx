import { useQuery } from "@tanstack/react-query";
import type { Ticket, TicketDependency } from "@trellis/api";
import { Button, PropertyRow, TicketId } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { failToast } from "../../../../../lib/failToast";
import { TicketPicker } from "../../../../pickers/TicketPicker";
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

export function DependenciesRow({ ticket }: DependenciesRowProps) {
	const { client, orpc, queryClient } = useApp();
	const open = usePickerStore((state) => state.open);
	const setOpen = usePickerStore((state) => state.setOpen);

	const busy = useRef(false);
	const [pending, setPending] = useState<string | null>(null);
	const relationships = useQuery({
		...orpc.tickets.dependencies.queryOptions({ input: { ticket: ticket.identifier } }),
		enabled: open === "dependencies" || open === "blocks",
		staleTime: 0,
	});

	const changeEdge = async (related: { identifier: string }, direction: "waitsOn" | "blocks", next: boolean) => {
		if (busy.current) return;
		busy.current = true;
		setPending(related.identifier);
		const target = direction === "waitsOn" ? ticket.identifier : related.identifier;
		const dependency = direction === "waitsOn" ? related.identifier : ticket.identifier;
		try {
			await client.tickets.updateDependencies({
				ticket: target,
				...(next ? { after: [dependency] } : { notAfter: [dependency] }),
			});
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.tickets.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.search.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.needsYou.key() }),
			]);
		} catch (error) {
			failToast(
				`The dependencies of ${target} did not change.`,
				error,
				() => void changeEdge(related, direction, next),
			);
		} finally {
			busy.current = false;
			setPending(null);
		}
	};
	const selection = (direction: "waitsOn" | "blocks") => ({
		items: relationships.data?.[direction] ?? [],
		onRemove: (related: TicketDependency) => changeEdge(related, direction, false),
		pending: pending !== null,
		removing: pending,
		loading: relationships.isPending,
		error: relationships.error,
		retry: () => void relationships.refetch(),
	});

	return (
		<>
			<PropertyRow compact align="start" label="Waits on">
				<TicketPicker
					project={ticket.project.key}
					exclude={[ticket.identifier]}
					selection={selection("waitsOn")}
					onAdd={(dependency) => void changeEdge(dependency, "waitsOn", true)}
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
					selection={selection("blocks")}
					onAdd={(released) => void changeEdge(released, "blocks", true)}
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
