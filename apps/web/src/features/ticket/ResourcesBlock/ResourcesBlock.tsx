import { useQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { SectionHeader } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";

export type ResourcesBlockProps = {
	ticket: Ticket;
};

// The words of the ticket that can name a resource: the ask and the five
// clauses of the contract. The comparison is lower case, so a path in the ask
// matches the name of the resource in any case.
const namingText = (ticket: Ticket): string =>
	[
		ticket.description,
		ticket.contract.result,
		...ticket.contract.files,
		...ticket.contract.leaveAlone,
		...ticket.contract.verify,
		...ticket.contract.reviewFocus,
	]
		.join("\n")
		.toLowerCase();

// The ask of a ticket that builds one step of a design opens with the step:
// `Step 6 of the routine runtime.`. The block prints that step after each
// resource name. An ask that names no step gives null, and the block prints
// the name alone.
const stepOf = (description: string): string | null => {
	const match = /\bstep (\d+)\b/i.exec(description);
	return match === null ? null : `step ${match[1]}`;
};

// The resources of the epic that the ticket names, each with the step of the
// ticket after its name. The list is read only here: a resource belongs to the
// epic, and the epic page adds one and opens one.
function NamedResources({ epic, naming, step }: { epic: string; naming: string; step: string | null }) {
	const { orpc } = useApp();
	const list = useQuery(orpc.resources.list.queryOptions({ input: { epic } }));
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
	if (list.data === undefined) return null;
	const named = list.data.filter((resource) => naming.includes(resource.name.toLowerCase()));
	if (named.length === 0) return null;
	return (
		<section aria-label="Resources" className="flex min-w-0 flex-col">
			<SectionHeader title="Resources" textCase="caps" />
			<ul className="flex min-w-0 flex-col">
				{named.map((resource) => (
					<li key={resource.id} className="truncate text-sm text-fg">
						{step === null ? resource.name : `${resource.name}, ${step}`}
					</li>
				))}
			</ul>
		</section>
	);
}

// The resources region of the ticket page. A resource belongs to an epic, so a
// ticket outside every epic has none.
export function ResourcesBlock({ ticket }: ResourcesBlockProps) {
	if (ticket.epic === null) return null;
	return <NamedResources epic={ticket.epic.ref} naming={namingText(ticket)} step={stepOf(ticket.description)} />;
}
