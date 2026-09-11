import type { AgentRole, AgentSession, AgentState } from "@trellis/api";
import { fail } from "../fail";
import { type Context, os } from "../implementer";
import { requireProject, requireTicket, requireWritable } from "../refs";
import { identifierOf, isoNow, newId, rootOf, type State, subtree } from "../state";
import { ticketSummary } from "../summaries";
import { prUrl } from "./prs";

// A session in one of these states holds a terminal, so the builder limit
// counts it and a second start for its ticket returns it.
const liveStates: AgentState[] = ["starting", "running", "waiting"];
const isLive = (session: AgentSession) => liveStates.includes(session.state);

const byCreated = (a: AgentSession, b: AgentSession) =>
	a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const sessionsOf = (state: State) => [...state.agentSessions.values()].sort(byCreated);

const liveSession = (state: State, role: AgentRole, match: (session: AgentSession) => boolean) =>
	sessionsOf(state).find((session) => session.role === role && isLive(session) && match(session));

// A runner call fails first on a runner that is down, then on agents or
// the root's manager being off. It returns the root's settings row.
const requireRunner = (state: State, rootId: string) => {
	if (state.runnerDown !== null) throw fail("RUNNER_UNAVAILABLE", { reason: state.runnerDown });
	const row = state.agentSettings.projects.find((project) => project.projectId === rootId);
	if (!state.agentSettings.enabled || row === undefined || !row.enabled) {
		throw fail("RUNNER_UNAVAILABLE", { reason: "disabled" });
	}
	return row;
};

// Stores the session and sends the agents.session event for it.
const store = (context: Context, session: AgentSession) => {
	context.state.agentSessions.set(session.id, session);
	context.bus.emit("agents.session", { session }, { projectId: session.projectId, ticketId: session.ticketId });
	return session;
};

const newSession = (
	fields: Pick<AgentSession, "projectId" | "ticketId" | "role" | "workspaceId" | "terminalId" | "title"> &
		Partial<AgentSession>,
): AgentSession => ({
	id: newId(),
	runner: "superset",
	state: "starting",
	openUrl: `superset://workspace/${fields.workspaceId}`,
	lastWokenAt: null,
	error: null,
	createdAt: isoNow(),
	...fields,
});

// A row written by a manager, a builder, or a reviewer that trellis runs.
const isAgentAction = (row: State["activity"][number]) =>
	row.actor.kind === "agent" && /^(manager|builder|reviewer)-/.test(row.actor.name);

// The runner place of every manager the fake starts.
const managerPlace = { workspaceId: "ws-manager", terminalId: "term-manager" };

// The manager writes as `agent:manager-<key>`, and its own rows never reach
// its inbox.
const isManagerRow = (key: string) => (row: State["activity"][number]) =>
	row.actor.kind === "agent" && row.actor.name === `manager-${key.toLowerCase()}`;

export const agents = {
	sessions: os.agents.sessions.handler(({ context, input }) => {
		const { state } = context;
		if (input.ticket !== undefined) {
			const ticket = requireTicket(state, input.ticket);
			return { sessions: sessionsOf(state).filter((session) => session.ticketId === ticket.id) };
		}
		const ids = new Set(subtree(state, requireProject(state, input.project!).id).map((project) => project.id));
		return { sessions: sessionsOf(state).filter((session) => ids.has(session.projectId)) };
	}),
	inbox: os.agents.inbox.handler(({ context, input }) => {
		const { state } = context;
		const root = rootOf(state, requireProject(state, input.project));
		const cursor = state.agentCursors.get(root.id) ?? 0;
		const unread = state.activity.filter((row) => row.rootId === root.id && row.id > cursor);
		const page = unread.slice(0, input.limit);
		const events = page.filter((row) => !isManagerRow(root.key)(row));
		const next = page.at(-1)?.id ?? cursor;
		state.agentCursors.set(root.id, next);
		const ticketIds = new Set(events.flatMap((row) => (row.ticketId === null ? [] : [row.ticketId])));
		const since = events[0]?.createdAt ?? isoNow();
		return {
			events,
			tickets: [...ticketIds].map((id) => ticketSummary(state, state.tickets.get(id)!)),
			comments: [...state.comments.values()].filter(
				(comment) => ticketIds.has(comment.ticketId) && comment.createdAt >= since,
			),
			cursor: next,
			more: unread.length > page.length,
		};
	}),
	register: os.agents.register.handler(({ context, input }) => {
		const { state } = context;
		const root = rootOf(state, requireProject(state, input.project));
		const ticket = input.ticket === undefined ? null : requireTicket(state, input.ticket);
		const held = sessionsOf(state).find(
			(session) => session.workspaceId === input.workspaceId && session.terminalId === input.terminalId,
		);
		if (held !== undefined) return store(context, { ...held, state: "running" });
		const identifier = ticket === null ? null : identifierOf(state, ticket);
		const titles = { manager: `${root.key} manager`, builder: identifier, reviewer: `${identifier} review` };
		return store(
			context,
			newSession({
				projectId: root.id,
				ticketId: ticket?.id ?? null,
				role: input.role,
				workspaceId: input.workspaceId,
				terminalId: input.terminalId,
				title: titles[input.role]!,
				state: "running",
			}),
		);
	}),
	startBuilder: os.agents.startBuilder.handler(({ context, input }) => {
		const { state } = context;
		const ticket = requireTicket(state, input.ticket);
		requireWritable(state, ticket.projectId);
		const row = requireRunner(state, ticket.rootId);
		const held = liveSession(state, "builder", (session) => session.ticketId === ticket.id);
		if (held !== undefined) return held;
		const running = sessionsOf(state).filter(
			(session) => session.projectId === ticket.rootId && session.role === "builder" && isLive(session),
		).length;
		if (running >= row.maxConcurrent) throw fail("CONCURRENCY_LIMIT", { limit: row.maxConcurrent, running });
		const identifier = identifierOf(state, ticket);
		return store(
			context,
			newSession({
				projectId: ticket.rootId,
				ticketId: ticket.id,
				role: "builder",
				workspaceId: `ws-${identifier.toLowerCase()}`,
				terminalId: "term-1",
				title: identifier,
			}),
		);
	}),
	startReviewer: os.agents.startReviewer.handler(({ context, input }) => {
		const { state } = context;
		const ticket = requireTicket(state, input.ticket);
		requireWritable(state, ticket.projectId);
		if (prUrl.exec(input.prUrl) === null) throw fail("INVALID_PR_URL", undefined);
		requireRunner(state, ticket.rootId);
		const builder = liveSession(state, "builder", (session) => session.ticketId === ticket.id)!;
		return store(
			context,
			newSession({
				projectId: ticket.rootId,
				ticketId: ticket.id,
				role: "reviewer",
				workspaceId: builder.workspaceId,
				terminalId: `term-${state.agentSessions.size + 1}`,
				title: `${identifierOf(state, ticket)} review`,
				openUrl: builder.openUrl,
			}),
		);
	}),
	stop: os.agents.stop.handler(({ context, input }) => {
		if (context.state.runnerDown !== null) throw fail("RUNNER_UNAVAILABLE", { reason: context.state.runnerDown });
		return store(context, { ...context.state.agentSessions.get(input.id)!, state: "stopped" });
	}),
	wake: os.agents.wake.handler(({ context, input }) => {
		const { state } = context;
		const root = rootOf(state, requireProject(state, input.project));
		requireRunner(state, root.id);
		const manager = liveSession(state, "manager", (session) => session.projectId === root.id)!;
		return store(context, { ...manager, lastWokenAt: isoNow() });
	}),
	// A failed or exited manager starts again in its own row.
	retryManager: os.agents.retryManager.handler(({ context, input }) => {
		const { state } = context;
		const root = rootOf(state, requireProject(state, input.project));
		requireRunner(state, root.id);
		const manager = sessionsOf(state)
			.filter((session) => session.projectId === root.id && session.role === "manager" && session.state !== "stopped")
			.at(-1);
		if (manager !== undefined) {
			return store(context, {
				...manager,
				...managerPlace,
				openUrl: `superset://workspace/${managerPlace.workspaceId}`,
				state: "starting",
				error: null,
			});
		}
		return store(
			context,
			newSession({
				projectId: root.id,
				ticketId: null,
				role: "manager",
				title: `${root.key} manager`,
				...managerPlace,
			}),
		);
	}),
	overview: os.agents.overview.handler(({ context }) => {
		const { state } = context;
		const actions = state.activity
			.filter(isAgentAction)
			.sort((a, b) => b.id - a.id)
			.slice(0, 50);
		const ticketIds = new Set(actions.flatMap((row) => (row.ticketId === null ? [] : [row.ticketId])));
		return {
			sessions: sessionsOf(state),
			actions,
			tickets: [...ticketIds].map((id) => ({ id, identifier: identifierOf(state, state.tickets.get(id)!) })),
			batches: [...state.agentBatches].sort((a, b) => b.at.localeCompare(a.at)),
		};
	}),
	settings: os.agents.settings.handler(({ context }) => context.state.agentSettings),
	setSettings: os.agents.setSettings.handler(({ context, input }) => {
		context.state.agentSettings = input;
		return input;
	}),
	// A trellis project matches a runner project whose repo is one of the
	// project's declared `owner/repo` pairs.
	runnerProjects: os.agents.runnerProjects.handler(({ context }) => {
		const { state } = context;
		if (state.runnerDown !== null) throw fail("RUNNER_UNAVAILABLE", { reason: state.runnerDown });
		const roots = [...state.projects.values()].filter((project) => project.parentId === null);
		return {
			projects: state.runnerProjects,
			matches: roots.flatMap((root) => {
				const repos = root.repos.map((repo) => `${repo.owner}/${repo.repo}`);
				const hit = state.runnerProjects.find((project) => project.repo !== null && repos.includes(project.repo));
				return hit === undefined ? [] : [{ projectId: root.id, runnerProjectId: hit.id }];
			}),
		};
	}),
};
