import { useQuery } from "@tanstack/react-query";
import { Command } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import type { RowDeps, Submenu } from "../../../rows";
import { submenuHeadings, submenuRows } from "../../../utils/submenuRows";

export type SubmenuGroupProps = {
	submenu: Submenu;
	deps: RowDeps;
};

// The values one submenu offers. The two lists it can need come from the
// server: the statuses of a project, and the tickets a parent is picked
// from. A query that is off never sends its placeholder input.
export function SubmenuGroup({ submenu, deps }: SubmenuGroupProps) {
	const { orpc } = useApp();
	const project = submenu.kind === "status" || submenu.kind === "parent" ? submenu.project : "";
	const statuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "status",
	});
	const tickets = useQuery({
		...orpc.tickets.list.queryOptions({ input: { project, limit: 20 } }),
		enabled: submenu.kind === "parent",
	});
	const rows = submenuRows(submenu, deps, {
		statuses: statuses.data?.statuses ?? [],
		tickets: tickets.data?.items ?? [],
	});
	return (
		<Command.Group heading={submenuHeadings[submenu.kind]}>
			{rows.map((row) => (
				<Command.Row
					key={row.value}
					value={row.value}
					label={row.label}
					sub={row.sub}
					mono={row.mono}
					icon={row.icon}
					keywords={row.keywords}
					onSelect={row.run}
				/>
			))}
		</Command.Group>
	);
}
