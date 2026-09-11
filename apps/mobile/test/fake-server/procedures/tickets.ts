import { os } from "../implementer";
import { decodeCursor, encodeCursor, filterTickets, sortTickets } from "../listing";
import { findProject, requireProject, requireTicket } from "../refs";
import { effectiveStatuses, type State } from "../state";
import { fullTicket, ticketSummary } from "../summaries";

const scopeProject = (state: State, ref: string | undefined) => (ref === undefined ? null : requireProject(state, ref));

// The statuses a board or a count groups by: the project's effective set,
// or every status in use when no project is given.
const columnStatuses = (state: State, ref: string | undefined) => {
	const project = ref === undefined ? undefined : findProject(state, ref);
	if (project !== undefined) return effectiveStatuses(state, project).statuses;
	return [...state.statuses.values()].sort((a, b) => a.position - b.position);
};

export const tickets = {
	list: os.tickets.list.handler(({ context, input }) => {
		const { state } = context;
		const rows = sortTickets(state, filterTickets(state, input, scopeProject(state, input.project)), input.sort);
		const offset = decodeCursor(input);
		const page = rows.slice(offset, offset + input.limit);
		const more = offset + input.limit < rows.length;
		return {
			items: page.map((row) => ticketSummary(state, row)),
			nextCursor: more ? encodeCursor(input, offset + input.limit) : null,
		};
	}),
	counts: os.tickets.counts.handler(({ context, input }) => {
		const { state } = context;
		const rows = filterTickets(state, input, scopeProject(state, input.project));
		const byStatus = columnStatuses(state, input.project).map((status) => ({
			statusId: status.id,
			count: rows.filter((row) => row.statusId === status.id).length,
		}));
		return { total: rows.length, byStatus };
	}),
	// A column lists the ticket that changed last at the top, and `list` with
	// `status=` continues the column in the same order.
	board: os.tickets.board.handler(({ context, input }) => {
		const { state } = context;
		const rows = sortTickets(state, filterTickets(state, input, scopeProject(state, input.project)), "-updatedAt");
		const columns = columnStatuses(state, input.project).map((status) => {
			const column = rows.filter((row) => row.statusId === status.id);
			return {
				statusId: status.id,
				count: column.length,
				items: column.slice(0, 100).map((row) => ticketSummary(state, row)),
			};
		});
		return { columns };
	}),
	get: os.tickets.get.handler(({ context, input }) =>
		fullTicket(context.state, requireTicket(context.state, input.ticket)),
	),
};
