import { useQuery } from "@tanstack/react-query";
import { Command } from "@trellis/ui";
import { useApp } from "../../../../../lib/appContext";
import type { RowDeps, Submenu } from "../../../rows";
import { drawRows } from "../../../utils/drawRows";
import { submenuHeadings, submenuRows } from "../../../utils/submenuRows";

export type SubmenuGroupProps = {
	submenu: Submenu;
	deps: RowDeps;
};

// The values one submenu offers. The three lists it can need come from the
// server: the statuses of a project, the tickets a parent is picked from,
// and the labels of a project tree. A query that is off never sends its
// placeholder input.
export function SubmenuGroup({ submenu, deps }: SubmenuGroupProps) {
	const { orpc } = useApp();
	const project =
		submenu.kind === "status" || submenu.kind === "parent" || submenu.kind === "labels" ? submenu.project : "";
	const statuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "status",
	});
	const tickets = useQuery({
		...orpc.tickets.list.queryOptions({ input: { project, limit: 20 } }),
		enabled: submenu.kind === "parent",
	});
	const labels = useQuery({
		...orpc.labels.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "labels",
	});
	const rows = submenuRows(submenu, deps, {
		statuses: statuses.data?.statuses ?? [],
		tickets: tickets.data?.items ?? [],
		labels: labels.data?.labels ?? [],
		labelGroups: labels.data?.groups ?? [],
	});
	return <Command.Group heading={submenuHeadings[submenu.kind]}>{drawRows(rows)}</Command.Group>;
}
