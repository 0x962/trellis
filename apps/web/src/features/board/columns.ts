import type { BoardOutput, Project, StatusCategory, StatusSummary, TicketSummary } from "@trellis/api";
import type { BoardColumnModel } from "./types";

export const categoryOrder: StatusCategory[] = ["todo", "started", "review", "done", "canceled"];

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
	items: TicketSummary[],
	ticketId: string,
	workingTicketIds: ReadonlySet<string>,
) =>
	workingTicketIds.has(ticketId)
		? 0
		: items.filter((ticket) => ticket.id !== ticketId && workingTicketIds.has(ticket.id)).length;

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
			const current = items.get(status.id) ?? [];
			const unloaded = Math.max(0, (original?.count ?? 0) - (original?.items.length ?? 0));
			return {
				id: status.id,
				name: status.name,
				category: status.category,
				statuses: [status],
				items: current,
				count: current.length + unloaded,
				wipLimit: status.wipLimit,
			};
		});
};

export const categoryColumns = (data: BoardOutput): BoardColumnModel[] => {
	const tickets = data.columns.flatMap((column) => column.items);
	return categoryOrder.map((category) => {
		const items = tickets.filter((ticket) => ticket.status.category === category);
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
				wipLimit: null,
				isDefault: false,
				createdAt: items[0]!.createdAt,
				updatedAt: items[0]!.updatedAt,
			})),
			items,
			count: items.length,
			wipLimit: null,
		};
	});
};

// The board after a status change. The server stamps the ticket, and a
// column lists the last updated ticket first, so the card takes the head of
// its new column.
export const moveInBoard = (data: BoardOutput, ticket: TicketSummary, targetStatus: StatusSummary): BoardOutput => {
	const columns = data.columns.map((column) => {
		const without = column.items.filter((item) => item.id !== ticket.id);
		const lost = column.items.length - without.length;
		if (column.statusId !== targetStatus.id) return { ...column, items: without, count: column.count - lost };
		const moved = { ...ticket, status: targetStatus };
		return { ...column, items: [moved, ...without], count: column.count + (lost === 0 ? 1 : 0) };
	});
	return { columns };
};
