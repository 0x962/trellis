import { useQuery } from "@tanstack/react-query";
import { EpicNameSchema, LabelNameSchema, type Status, type TicketSummary, WaveNameSchema } from "@trellis/api";
import { Command } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { usePickerCreate } from "../../../../pickers/hooks/usePickerCreate";
import { createNameItem } from "../../../../pickers/utils/createNameItem";
import { StatusCreateDialog } from "../../../../project-settings/StatusCreateDialog";
import type { RowDeps, Submenu } from "../../../rows";
import { drawRows } from "../../../utils/drawRows";
import { submenuHeadings, submenuRows } from "../../../utils/submenuRows";
import type { RelatedTicketRequest } from "../../relatedTicketRequest";

export type SubmenuGroupProps = {
	submenu: Submenu;
	deps: RowDeps;
	query?: string;
	onCreateTicket: (request: RelatedTicketRequest) => void;
};

// The values one submenu offers. The five lists it can need come from the
// server: the statuses of a project, the tickets a parent is picked from,
// the labels of a project, the epics of a project, and the
// waves of an epic. A query that is off never sends its placeholder
// input.
export function SubmenuGroup({ submenu, deps, query = "", onCreateTicket }: SubmenuGroupProps) {
	const { client, orpc, queryClient } = useApp();
	const createScope = JSON.stringify({ submenu, selected: deps.selection.map((ticket) => ticket.id) });
	const [statusName, setStatusName] = useState<{ name: string; scope: string } | null>(null);
	const project =
		submenu.kind === "status" || submenu.kind === "parent" || submenu.kind === "labels" || submenu.kind === "epic"
			? submenu.project
			: "";
	const statuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "status",
	});
	const tickets = useQuery({
		...orpc.search.query.queryOptions({ input: { project, q: query.trim(), limit: 20 } }),
		enabled: submenu.kind === "parent",
	});
	const labels = useQuery({
		...orpc.labels.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "labels",
	});
	const epics = useQuery({
		...orpc.epics.list.queryOptions({ input: { project } }),
		enabled: submenu.kind === "epic",
	});
	const epic = useQuery({
		...orpc.epics.get.queryOptions({ input: { epic: submenu.kind === "wave" ? submenu.epic : "" } }),
		enabled: submenu.kind === "wave",
	});
	const data = {
		statuses: statuses.data?.statuses ?? [],
		tickets: tickets.data?.tickets ?? [],
		labels: labels.data?.labels ?? [],
		labelGroups: labels.data?.groups ?? [],
		epics: epics.data ?? [],
		waves: epic.data?.waves ?? [],
	};
	const rows = submenuRows(submenu, deps, data);
	const creation = usePickerCreate({
		scope: createScope,
		create: async (name) => {
			if (submenu.kind === "epic") return { ...data, epics: [await client.epics.create({ project, name })] };
			if (submenu.kind === "wave") return { ...data, waves: [await client.waves.create({ epic: submenu.epic, name })] };
			return { ...data, labels: [await client.labels.create({ project, name })] };
		},
		invalidate: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.labels.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
			]),
		onCreated: (created) =>
			submenuRows(submenu, deps, created)
				.find((row) => !row.value.endsWith(".none"))!
				.run(),
	});
	const source =
		submenu.kind === "epic" ? epics : submenu.kind === "wave" ? epic : submenu.kind === "labels" ? labels : statuses;
	const names =
		submenu.kind === "epic"
			? data.epics
			: submenu.kind === "wave"
				? data.waves
				: submenu.kind === "labels"
					? data.labels
					: data.statuses;
	const schema = submenu.kind === "epic" ? EpicNameSchema : submenu.kind === "wave" ? WaveNameSchema : LabelNameSchema;
	const kind = submenu.kind === "labels" ? "label" : submenu.kind;
	const item =
		submenu.kind === "parent"
			? tickets.isSuccess
				? createNameItem(
						"ticket",
						query,
						data.tickets.flatMap((ticket) => [ticket.title, ticket.identifier]),
					)
				: null
			: ["epic", "wave", "labels", "status"].includes(submenu.kind) && source.isSuccess
				? createNameItem(
						kind,
						query,
						names.map((item) => item.name),
						(name) => schema.safeParse(name).success,
					)
				: null;
	const createdStatus = (status: Status) => {
		setStatusName(null);
		submenuRows(submenu, deps, { ...data, statuses: [status] })[0]!.run();
	};
	const createdTicket = (ticket: TicketSummary) => {
		submenuRows(submenu, deps, { ...data, tickets: [ticket] })
			.find((row) => row.value !== "parent.none")!
			.run();
	};
	return (
		<>
			<Command.Group heading={submenuHeadings[submenu.kind]}>
				{drawRows(rows)}
				{item && (
					<Command.Row
						value={item.id}
						label={item.label}
						keywords={item.keywords}
						icon={item.icon}
						onSelect={() => {
							if (submenu.kind === "status") setStatusName({ name: query.trim(), scope: createScope });
							else if (submenu.kind === "parent")
								onCreateTicket({
									scope: `command:parent:${project}:${submenu.tickets.join(",")}`,
									project,
									initialTitle: query.trim(),
									onCreated: createdTicket,
								});
							else creation.create(query.trim());
						}}
					/>
				)}
			</Command.Group>
			{creation.error && (
				<p role="alert" className="px-3 py-2 text-sm text-danger">
					{creation.error}
				</p>
			)}
			{statusName !== null && statusName.scope === createScope && (
				<StatusCreateDialog
					project={project}
					scope={createScope}
					initialName={statusName.name}
					onCreated={createdStatus}
					onClose={() => setStatusName(null)}
				/>
			)}
		</>
	);
}
