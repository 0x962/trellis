import type { ActorHeader, Priority, Status } from "@trellis/api";
import { fail } from "../fail";
import { type Context, os } from "../implementer";
import {
	addActivity,
	effectiveStatuses,
	identifierOf,
	isoNow,
	newId,
	requireProject,
	requireStatus,
	requireTicket,
	type State,
	type TicketRow,
	touchActor,
} from "../state";
import { childrenOfTicket, fullTicket, ticketSummary } from "../summaries";

type Change = { field: string; from: string | null; to: string | null };

// Every write bumps the version by one, stamps the actor, writes one
// activity row per field, and emits one ticket.updated with the fields.
const commit = (context: Context, row: TicketRow, changes: Change[], created = false) => {
	const { state, bus } = context;
	const actor = context.actor!;
	const at = isoNow();
	const batchId = newId();
	row.version += 1;
	row.updatedAt = at;
	row.lastActor = { ...actor, at };
	touchActor(state, actor, at);
	for (const change of changes) {
		addActivity(state, {
			rootId: row.rootId,
			projectId: row.projectId,
			ticketId: row.id,
			actor,
			action: created ? "created" : "changed",
			field: created ? null : change.field,
			fromValue: change.from,
			toValue: change.to,
			createdAt: at,
			batchId,
		});
	}
	bus.emit(
		created ? "ticket.created" : "ticket.updated",
		{ summary: ticketSummary(state, row), fields: created ? [] : changes.map((change) => change.field), batchId },
		{ ticketId: row.id, projectId: row.projectId },
	);
};

// A move to a done or a canceled status stamps completedAt; a move out of
// one clears it. An agent needs force to reach a done status.
const applyStatus = (state: State, row: TicketRow, status: Status, actor: ActorHeader, force: boolean): Change[] => {
	const old = state.statuses.get(row.statusId)!;
	if (status.category === "done" && actor.kind === "agent" && !force) {
		throw fail("AGENT_CANNOT_COMPLETE", {
			status: {
				id: status.id,
				slug: status.slug,
				name: status.name,
				category: status.category,
				reviewer: status.reviewer,
				color: status.color,
			},
		});
	}
	row.statusId = status.id;
	row.statusChangedAt = isoNow();
	const finished = status.category === "done" || status.category === "canceled";
	row.completedAt = finished ? isoNow() : null;
	return [{ field: "status", from: old.name, to: status.name }];
};

const checkVersion = (state: State, row: TicketRow, expected: number | undefined) => {
	if (expected !== undefined && expected !== row.version)
		throw fail("VERSION_CONFLICT", { current: fullTicket(state, row) });
};

export const ticketWrites = {
	create: os.tickets.create.handler(({ context, input }) => {
		const { state } = context;
		const project = requireProject(state, input.project);
		const root = state.projects.get(project.rootId)!;
		const { statuses } = effectiveStatuses(state, project);
		const status =
			input.status === undefined
				? statuses.find((entry) => entry.isDefault)!
				: requireStatus(state, project, input.status);
		const parent = input.parent === undefined ? null : requireTicket(state, input.parent);
		if (parent !== null && parent.rootId !== root.id) throw fail("CROSS_ROOT_MOVE", undefined);
		root.ticketCounter += 1;
		const at = isoNow();
		const column = [...state.tickets.values()].filter((row) => row.statusId === status.id);
		const row: TicketRow = {
			id: newId(),
			rootId: root.id,
			projectId: project.id,
			number: root.ticketCounter,
			title: input.title,
			description: input.description ?? project.ticketTemplate,
			priority: input.priority ?? "none",
			statusId: status.id,
			parentId: parent === null ? null : parent.id,
			position: Math.max(0, ...column.map((entry) => entry.position)) + 1024,
			version: 0,
			createdAt: at,
			updatedAt: at,
			completedAt: null,
			statusChangedAt: at,
			lastActor: null,
		};
		state.tickets.set(row.id, row);
		commit(context, row, [{ field: "created", from: null, to: null }], true);
		context.resHeaders.set("location", `/api/tickets/${identifierOf(state, row)}`);
		return fullTicket(state, row);
	}),
	update: os.tickets.update.handler(({ context, input }) => {
		const { state } = context;
		const row = requireTicket(state, input.ticket);
		checkVersion(state, row, input.expectedVersion ?? context.ifMatch ?? undefined);
		const changes: Change[] = [];
		if (input.title !== undefined) {
			changes.push({ field: "title", from: row.title, to: input.title });
			row.title = input.title;
		}
		if (input.description !== undefined) {
			changes.push({ field: "description", from: null, to: null });
			row.description = input.description;
		}
		if (input.priority !== undefined) {
			changes.push({ field: "priority", from: row.priority, to: input.priority });
			row.priority = input.priority as Priority;
		}
		if (input.project !== undefined) {
			const project = requireProject(state, input.project);
			if (project.rootId !== row.rootId) throw fail("CROSS_ROOT_MOVE", undefined);
			changes.push({ field: "project", from: state.projects.get(row.projectId)!.path, to: project.path });
			row.projectId = project.id;
		}
		if (input.parent !== undefined) {
			const parent = input.parent === null ? null : requireTicket(state, input.parent);
			if (parent !== null && (parent.id === row.id || parent.rootId !== row.rootId))
				throw fail("PARENT_CYCLE", undefined);
			changes.push({ field: "parent", from: null, to: parent === null ? null : identifierOf(state, parent) });
			row.parentId = parent === null ? null : parent.id;
		}
		if (input.status !== undefined) {
			const status = requireStatus(state, state.projects.get(row.projectId)!, input.status);
			changes.push(...applyStatus(state, row, status, context.actor!, false));
		}
		commit(context, row, changes);
		return fullTicket(state, row);
	}),
	move: os.tickets.move.handler(({ context, input }) => {
		const { state } = context;
		const row = requireTicket(state, input.ticket);
		checkVersion(state, row, input.expectedVersion);
		const status = requireStatus(state, state.projects.get(row.projectId)!, input.status);
		const changes = applyStatus(state, row, status, context.actor!, input.force ?? false);
		const column = [...state.tickets.values()].filter((entry) => entry.statusId === status.id && entry.id !== row.id);
		const anchorRef = input.after ?? input.before;
		const anchor = anchorRef === undefined ? null : requireTicket(state, anchorRef);
		if (anchor !== null && anchor.statusId !== status.id) throw fail("INVALID_ANCHOR", undefined);
		const positions = column.map((entry) => entry.position);
		row.position =
			anchor === null
				? Math.max(0, ...positions) + 1024
				: input.after !== undefined
					? anchor.position + 0.5
					: anchor.position - 0.5;
		changes.push({ field: "position", from: null, to: String(row.position) });
		commit(context, row, changes);
		return fullTicket(state, row);
	}),
	delete: os.tickets.delete.handler(({ context, input }) => {
		const { state, bus } = context;
		const row = requireTicket(state, input.ticket);
		if (context.actor!.kind === "agent" && input.force !== true) throw fail("AGENT_CANNOT_DELETE", undefined);
		const summary = ticketSummary(state, row);
		for (const child of childrenOfTicket(state, row.id)) child.parentId = null;
		for (const comment of [...state.comments.values()])
			if (comment.ticketId === row.id) state.comments.delete(comment.id);
		for (const attachment of [...state.attachments.values()])
			if (attachment.ticketId === row.id) state.attachments.delete(attachment.id);
		state.prLinks = state.prLinks.filter((link) => link.ticketId !== row.id);
		state.tickets.delete(row.id);
		bus.emit(
			"ticket.deleted",
			{ summary, fields: [], batchId: newId() },
			{ ticketId: row.id, projectId: row.projectId },
		);
		return { deleted: summary.identifier };
	}),
	updateMany: os.tickets.updateMany.handler(({ context, input }) => {
		const { state } = context;
		const items = input.tickets.map((ref) => {
			const row = requireTicket(state, ref);
			const changes: Change[] = [];
			if (input.priority !== undefined) {
				changes.push({ field: "priority", from: row.priority, to: input.priority });
				row.priority = input.priority as Priority;
			}
			if (input.status !== undefined) {
				const status = requireStatus(state, state.projects.get(row.projectId)!, input.status);
				changes.push(...applyStatus(state, row, status, context.actor!, input.force ?? false));
			}
			commit(context, row, changes);
			return ticketSummary(state, row);
		});
		return { items };
	}),
	deleteMany: os.tickets.deleteMany.handler(({ context, input }) => {
		const { state, bus } = context;
		if (context.actor!.kind === "agent" && input.force !== true) throw fail("AGENT_CANNOT_DELETE", undefined);
		const deleted = input.tickets.map((ref) => {
			const row = requireTicket(state, ref);
			const summary = ticketSummary(state, row);
			state.tickets.delete(row.id);
			bus.emit(
				"ticket.deleted",
				{ summary, fields: [], batchId: newId() },
				{ ticketId: row.id, projectId: row.projectId },
			);
			return summary.identifier;
		});
		return { deleted };
	}),
};
