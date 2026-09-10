import { Link } from "@tanstack/react-router";
import { Button, EmptyState } from "@trellis/ui";
import { Inbox } from "lucide-react";
import { projectSlashPath } from "../../../lib/projectPath";
import { CliLine } from "../../shell/CliLine";

export type TableEmptyProps = {
	// The project ref of the route, or undefined on /all.
	project?: string;
	// True when a filter narrows the list; false when the project holds no ticket.
	filtered: boolean;
	// The search text of the view, when set.
	q?: string;
	// Opens the composer.
	onCreate?: () => void;
};

const linkClass =
	"inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// What the table shows with no row: the first-ticket state of an empty
// project, or the no-match state of a filter. The clear link drops every
// filter param and keeps the route.
export function TableEmpty({ project, filtered, q, onCreate }: TableEmptyProps) {
	if (filtered) {
		const clear =
			project === undefined ? (
				<Link to="/all" search={{}} className={linkClass}>
					Clear filters
				</Link>
			) : (
				<Link to="/p/$" params={{ _splat: projectSlashPath(project) }} search={{}} className={linkClass}>
					Clear filters
				</Link>
			);
		return (
			<EmptyState
				title={q === undefined ? "No tickets match" : `No tickets match '${q}'`}
				description="Every filter above narrows the list."
				className="flex-1 justify-center"
				action={clear}
			/>
		);
	}
	// The CLI takes the dotted project ref and the title from -t. /all has
	// no project, so its line names the flag with a placeholder value.
	const command = `trellis create -p ${project ?? "<project>"} -t "First ticket"`;
	return (
		<EmptyState
			icon={<Inbox />}
			title="No tickets yet"
			description="Create the first one here or from a terminal."
			className="flex-1 justify-center"
			action={
				<div className="flex flex-col items-center gap-3">
					<Button variant="primary" onClick={onCreate}>
						Create ticket
					</Button>
					<CliLine command={command} />
				</div>
			}
		/>
	);
}
