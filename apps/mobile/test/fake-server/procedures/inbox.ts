import { os } from "../implementer";
import { textMatches, titleMatches } from "../listing";
import { isOpen, requireProject, requireTicket } from "../refs";
import { identifierOf, type ProjectRow, projectsInOrder, type State, subtree, type TicketRow } from "../state";
import { fullTicket, linkedPrs, prBadge, projectSummary, ticketSummary } from "../summaries";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

const section = (state: State, rows: TicketRow[]) => ({
	items: rows.slice(0, 100).map((row) => ticketSummary(state, row)),
	total: rows.length,
});

const byTime =
	(key: (row: TicketRow) => string, desc = false) =>
	(a: TicketRow, b: TicketRow) => {
		const left = key(a);
		const right = key(b);
		const order = left < right ? -1 : left > right ? 1 : 0;
		return desc ? -order : order;
	};

// Review: a human-reviewer status, oldest waiting first. Failing CI: open
// with a failing check. Stalled: started and quiet for settings.stalledHours.
// Done by agents today: done by an agent in the last 24 hours.
const inboxOf = (state: State, project: ProjectRow | null) => {
	const scope = project === null ? null : new Set(subtree(state, project.id).map((row) => row.id));
	const rows = [...state.tickets.values()].filter((row) => scope === null || scope.has(row.projectId));
	const now = Date.now();
	const status = (row: TicketRow) => state.statuses.get(row.statusId)!;
	const review = rows
		.filter((row) => status(row).category === "review" && status(row).reviewer === "human")
		.sort(byTime((row) => row.statusChangedAt));
	const failingCi = rows
		.filter((row) => isOpen(state, row) && prBadge(state, row.id)?.ciState === "fail")
		.sort(byTime((row) => row.updatedAt, true));
	const stalledBefore = new Date(now - state.settings.stalledHours * hourMs).toISOString();
	const stalled = rows
		.filter((row) => status(row).category === "started" && row.updatedAt < stalledBefore)
		.sort(byTime((row) => row.updatedAt));
	const dayAgo = new Date(now - dayMs).toISOString();
	const doneByAgentsToday = rows
		.filter(
			(row) =>
				status(row).category === "done" &&
				row.completedAt !== null &&
				row.completedAt >= dayAgo &&
				row.lastActor?.kind === "agent",
		)
		.sort(byTime((row) => row.completedAt!, true));
	return {
		review: section(state, review),
		failingCi: section(state, failingCi),
		stalled: section(state, stalled),
		doneByAgentsToday: section(state, doneByAgentsToday),
	};
};

export const inbox = {
	get: os.inbox.get.handler(({ context, input }) =>
		inboxOf(context.state, input.project === undefined ? null : requireProject(context.state, input.project)),
	),
};

export const brief = {
	get: os.brief.get.handler(({ context, input }) => {
		const { state } = context;
		const row = requireTicket(state, input.ticket);
		const ticket = fullTicket(state, row);
		const prs = linkedPrs(state, row.id);
		const lines = [
			`# ${ticket.identifier}: ${ticket.title}`,
			"",
			`Project: ${ticket.project.path}`,
			`Status: ${ticket.status.name}`,
			`Priority: ${ticket.priority}`,
			...(ticket.parent === null ? [] : [`Parent: ${ticket.parent.identifier}`]),
			"",
			ticket.description,
			"",
			...(prs.length === 0
				? []
				: ["## Pull requests", ...prs.map((pr) => `- ${pr.url} (${pr.state}, CI ${pr.ciState})`), ""]),
			"## Protocol",
			"",
			`Move the status with \`trellis status ${ticket.identifier} in-progress\`. Comment with \`trellis comment ${ticket.identifier} "..."\`.`,
			"When the work is ready for review, set the status to agent-review. Do not set done.",
		];
		return { markdown: lines.join("\n"), generatedAt: new Date().toISOString() };
	}),
};

const identifierPattern = /^[a-z][a-z0-9]{1,9}-[1-9][0-9]*$/i;

export const search = {
	query: os.search.query.handler(({ context, input }) => {
		const { state } = context;
		const project = input.project === undefined ? null : requireProject(state, input.project);
		const scope = project === null ? null : new Set(subtree(state, project.id).map((row) => row.id));
		const rows = [...state.tickets.values()].filter((row) => scope === null || scope.has(row.projectId));
		const q = input.q.trim();
		const exact = identifierPattern.test(q)
			? rows.find((row) => identifierOf(state, row) === q.toUpperCase())
			: undefined;
		const byWord = (order: number) => (a: TicketRow, b: TicketRow) => (a.updatedAt < b.updatedAt ? order : -order);
		// The identifier first, then the rows whose text holds every typed
		// word, then the rows a typo reaches.
		const matches = rows.filter((row) => row !== exact && textMatches(row, q)).sort(byWord(1));
		const near = rows
			.filter((row) => row !== exact && !matches.includes(row) && titleMatches(row.title, q))
			.sort(byWord(1));
		const tickets = [...(exact === undefined ? [] : [exact]), ...matches, ...near].slice(0, input.limit);
		const needle = q.toLowerCase();
		const projects = projectsInOrder(state).filter(
			(row) =>
				(scope === null || scope.has(row.id)) &&
				(row.name.toLowerCase().includes(needle) || row.slug.includes(needle) || row.key.toLowerCase() === needle),
		);
		return {
			tickets: tickets.map((row) => ticketSummary(state, row)),
			projects: projects.map((row) => projectSummary(state, row)),
		};
	}),
};
