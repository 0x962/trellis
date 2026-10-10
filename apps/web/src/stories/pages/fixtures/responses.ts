import type { ListQueryInput, TicketSummary } from "@trellis/api";
import { epic, epics } from "./epic";
import { project, statuses, ticket, tickets } from "./project";

export const ticketCounts = (rows: TicketSummary[]) => ({
	total: rows.length,
	byStatus: statuses.map((status) => ({
		statusId: status.id,
		count: rows.filter((row) => row.status.id === status.id).length,
	})),
});

export const ticketBoard = (rows: TicketSummary[]) => ({
	columns: statuses.map((status) => ({
		statusId: status.id,
		count: rows.filter((row) => row.status.id === status.id).length,
		items: rows.filter((row) => row.status.id === status.id),
	})),
});

export const ticketPage = (rows: TicketSummary[]) => (input: ListQueryInput) => ({
	items: rows.filter((row) => {
		const statusRefs = typeof input.status === "string" ? input.status.split(",") : input.status;
		if (
			statusRefs &&
			!statusRefs.some((status) => [row.status.id, row.status.slug, `category:${row.status.category}`].includes(status))
		)
			return false;
		if (input.category && !input.category.includes(row.status.category)) return false;
		if (input.priority && !input.priority.includes(row.priority)) return false;
		if (input.q && !row.title.toLowerCase().includes(input.q.toLowerCase())) return false;
		return true;
	}),
	nextCursor: null,
});

export const projectResponses = {
	"projects.get": project,
	"projects.list": (input: { archived?: boolean }) => (input.archived ? [] : [project]),
	"projects.repos": project.repos,
	"statuses.list": { statuses },
	"labels.list": { groups: [], labels: [] },
	"tickets.board": ticketBoard(tickets),
	"tickets.counts": ticketCounts(tickets),
	"tickets.list": ticketPage(tickets),
	"tickets.get": ticket,
	"tickets.dependencies": { waitsOn: [], blocks: [] },
	"epics.list": epics,
	"epics.get": epic,
	"agentRuns.list": { items: [], nextCursor: null },
	"agentRuns.latestByEpicTicket": [],
	"agentRuns.workspaceLineStats": [],
	"harnessAccounts.list": [],
	"actors.list": [],
	"attachments.list": [],
	"resources.list": [],
	"resourceComments.list": [],
	"pullRequests.list": [],
};
