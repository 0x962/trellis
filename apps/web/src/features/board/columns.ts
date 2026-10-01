import type { BoardOutput, Project, StatusCategory, StatusSummary, TicketSummary } from "@trellis/api";
import type { BoardColumnModel } from "./types";

export const categoryOrder: StatusCategory[] = ["todo", "started", "review", "done", "canceled"];

type CreatedTicket = Pick<TicketSummary, "id" | "createdAt">;
const createdFirst = (left: CreatedTicket, right: CreatedTicket) =>
	right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);

const categoryNames: Record<StatusCategory, string> = {
	todo: "Todo",
	started: "Started",
	review: "Review",
	done: "Done",
	canceled: "Canceled",
};

const itemsByStatus = (data: BoardOutput) => {
	const result = new Map<string, TicketSummary[]>();
	for (const ticket of data.columns.flatMap((column) => column.items)) {
		const items = result.get(ticket.status.id) ?? [];
		items.push(ticket);
		result.set(ticket.status.id, items);
	}
	return result;
};

export const workingFirst = (columns: BoardColumnModel[], workingTicketIds: ReadonlySet<string>): BoardColumnModel[] =>
	columns.map((column) => ({
		...column,
		items: [
			...column.items.filter((ticket) => workingTicketIds.has(ticket.id)),
			...column.items.filter((ticket) => !workingTicketIds.has(ticket.id)),
		],
	}));

export const workingGroupInsertIndex = (
	items: readonly TicketSummary[],
	ticket: CreatedTicket,
	workingTicketIds: ReadonlySet<string>,
) => {
	const working = Number(workingTicketIds.has(ticket.id));
	return items.filter((item) => {
		const group = Number(workingTicketIds.has(item.id));
		return item.id !== ticket.id && (group > working || (group === working && createdFirst(item, ticket) < 0));
	}).length;
};

export const projectColumns = (data: BoardOutput, project: Project): BoardColumnModel[] => {
	const items = itemsByStatus(data);
	const source = new Map(data.columns.map((column) => [column.statusId, column]));
	return [...project.statuses]
		.sort(
			(left, right) =>
				categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category) || left.position - right.position,
		)
		.map((status) => {
			const original = source.get(status.id);
			const current = (items.get(status.id) ?? []).sort(createdFirst);
			const unloaded = Math.max(0, (original?.count ?? 0) - (original?.items.length ?? 0));
			return {
				id: status.id,
				name: status.name,
				category: status.category,
				statuses: [status],
				items: current,
				count: current.length + unloaded,
			};
		});
};

export const categoryColumns = (data: BoardOutput): BoardColumnModel[] => {
	const tickets = data.columns.flatMap((column) => column.items);
	return categoryOrder.map((category) => {
		const items = tickets.filter((ticket) => ticket.status.category === category).sort(createdFirst);
		const statuses = new Map(items.map((ticket) => [ticket.status.id, ticket.status]));
		return {
			id: `category:${category}`,
			name: categoryNames[category],
			category,
			statuses: [...statuses.values()].map((status, position) => ({
				...status,
				projectId: items.find((ticket) => ticket.status.id === status.id)!.project.id,
				description: "",
				position,
				isDefault: false,
				createdAt: items[0]!.createdAt,
				updatedAt: items[0]!.updatedAt,
			})),
			items,
			count: items.length,
		};
	});
};

// The order shown before the server reply must match its saved order so a refresh keeps each card in place.
export const moveInBoard = (data: BoardOutput, ticket: TicketSummary, targetStatus: StatusSummary): BoardOutput => {
	const columns = data.columns.map((column) => {
		const without = column.items.filter((item) => item.id !== ticket.id);
		const lost = column.items.length - without.length;
		if (column.statusId !== targetStatus.id) return { ...column, items: without, count: column.count - lost };
		const moved = { ...ticket, status: targetStatus };
		return { ...column, items: [moved, ...without].sort(createdFirst), count: column.count + (lost === 0 ? 1 : 0) };
	});
	return { columns };
};
