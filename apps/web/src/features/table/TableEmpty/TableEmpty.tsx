import { Link } from "@tanstack/react-router";
import { Button, EmptyState } from "@trellis/ui";

import { CliLine } from "../../shell/CliLine";

export type TableEmptyProps = {
	// The project ref of the route.
	project: string;
	// True when a filter narrows the list; false when the project holds no ticket.
	filtered: boolean;
	// The search text of the view, when set.
	q?: string;
	// Opens the composer.
	onCreate?: () => void;
};

const linkClass =
	"inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-base font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// What the table shows with no row: the first-ticket state of an empty
// project, or the no-match state of a filter. The clear link drops every
// filter param and keeps the route.
export function TableEmpty({ project, filtered, q, onCreate }: TableEmptyProps) {
	if (filtered) {
		return (
			<EmptyState
				title={q === undefined ? "No tickets match" : `No tickets match '${q}'`}
				description="Clear the filters to see every ticket."
				variant="page"
				action={
					<Link to="/p/$" params={{ _splat: project }} search={{}} className={linkClass}>
						Clear filters
					</Link>
				}
			/>
		);
	}
	// The CLI takes the dotted project ref and the title from -t.
	const command = `trellis create -p ${project} -t "First ticket"`;
	return (
		<EmptyState
			title="No tickets yet"
			description="Create the first one here or from a terminal."
			variant="page"
			action={
				<div className="flex flex-col items-center gap-3">
					<Button variant="primary" size="md" onClick={onCreate}>
						Create ticket
					</Button>
					<CliLine command={command} />
				</div>
			}
		/>
	);
}
