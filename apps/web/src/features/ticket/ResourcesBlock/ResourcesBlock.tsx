import { useQuery } from "@tanstack/react-query";
import type { Resource, Ticket } from "@trellis/api";
import { ResourceRow, SectionHeader } from "@trellis/ui";
import { useMemo } from "react";
import { useApp } from "../../../lib/appContext";
import { namedResources, stepOf, ticketText } from "./namedResources";

export type ResourcesBlockProps = {
	ticket: Ticket;
};

const noResources: readonly Resource[] = [];

// The resources of the epic that the ticket names, in the row of the epic
// page. A resource belongs to the epic, so the epic page adds one and opens
// one, and this block prints them.
function NamedResources({ ticket, epic }: { ticket: Ticket; epic: string }) {
	const { orpc } = useApp();
	const { description, contract } = ticket;
	const list = useQuery(orpc.resources.list.queryOptions({ input: { epic } }));
	const text = useMemo(() => ticketText(description, contract), [description, contract]);
	const step = useMemo(() => stepOf(description), [description]);
	const named = useMemo(() => namedResources(list.data ?? noResources, text), [list.data, text]);
	if (list.error !== null) {
		return (
			<section aria-label="Resources" className="flex min-w-0 flex-col">
				<SectionHeader title="Resources" textCase="caps" />
				<p role="alert" className="text-sm text-danger">
					{list.error.message}
				</p>
			</section>
		);
	}
	if (named.length === 0) return null;
	return (
		<section aria-label="Resources" className="flex min-w-0 flex-col">
			<SectionHeader title="Resources" textCase="caps" />
			<ul className="flex min-w-0 flex-col">
				{named.map((resource) => (
					<ResourceRow
						key={resource.id}
						row={{
							id: resource.id,
							kind: resource.kind,
							name: resource.name,
							detail: step ?? "",
							pullRequest: resource.pullRequestNumber,
						}}
					/>
				))}
			</ul>
		</section>
	);
}

// The resources region of the ticket page. A resource belongs to an epic, so a
// ticket outside every epic has none.
export function ResourcesBlock({ ticket }: ResourcesBlockProps) {
	if (ticket.epic === null) return null;
	return <NamedResources ticket={ticket} epic={ticket.epic.ref} />;
}
