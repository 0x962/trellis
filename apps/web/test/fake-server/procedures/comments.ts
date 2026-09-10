import type { TimelineItem } from "@trellis/api";
import { fail } from "../fail";
import { os } from "../implementer";
import { isoNow, newId, requireTicket, requireWritable, touchActor } from "../state";

// Comments and the timeline. A comment is user-visible activity, so the
// ticket's version and updatedAt move with it.

const requireComment = (state: Parameters<typeof requireTicket>[0], id: string) => {
	const comment = state.comments.get(id);
	if (comment === undefined) throw fail("NOT_FOUND", { kind: "comment", ref: id });
	return comment;
};

const cursorOf = (item: TimelineItem) => `${item.createdAt}|${item.kind}|${item.id}`;

export const comments = {
	create: os.comments.create.handler(({ context, input }) => {
		const { state, bus } = context;
		const ticket = requireTicket(state, input.ticket);
		requireWritable(state, ticket.projectId);
		const at = isoNow();
		const comment = {
			id: newId(),
			ticketId: ticket.id,
			body: input.body,
			actor: context.actor!,
			createdAt: at,
			updatedAt: at,
		};
		state.comments.set(comment.id, comment);
		ticket.version += 1;
		ticket.updatedAt = at;
		ticket.lastActor = { ...context.actor!, at };
		touchActor(state, context.actor!, at);
		bus.emit(
			"comment.created",
			{ id: comment.id, ticketId: ticket.id },
			{ ticketId: ticket.id, projectId: ticket.projectId },
		);
		context.resHeaders.set("location", `/api/comments/${comment.id}`);
		return comment;
	}),
	update: os.comments.update.handler(({ context, input }) => {
		const { state, bus } = context;
		const comment = requireComment(state, input.id);
		comment.body = input.body;
		comment.updatedAt = isoNow();
		const ticket = state.tickets.get(comment.ticketId)!;
		bus.emit(
			"comment.updated",
			{ id: comment.id, ticketId: ticket.id },
			{ ticketId: ticket.id, projectId: ticket.projectId },
		);
		return comment;
	}),
	delete: os.comments.delete.handler(({ context, input }) => {
		const { state, bus } = context;
		const comment = requireComment(state, input.id);
		state.comments.delete(comment.id);
		const ticket = state.tickets.get(comment.ticketId)!;
		ticket.version += 1;
		ticket.updatedAt = isoNow();
		bus.emit(
			"comment.deleted",
			{ id: comment.id, ticketId: ticket.id },
			{ ticketId: ticket.id, projectId: ticket.projectId },
		);
		return { deleted: comment.id };
	}),
};

export const timeline = {
	list: os.timeline.list.handler(({ context, input }) => {
		const { state } = context;
		const ticket = requireTicket(state, input.ticket);
		const items: TimelineItem[] = [
			...[...state.comments.values()]
				.filter((comment) => comment.ticketId === ticket.id)
				.map((comment) => ({ kind: "comment" as const, ...comment })),
			...state.activity
				.filter((activity) => activity.ticketId === ticket.id)
				.map((activity) => ({ kind: "activity" as const, ...activity })),
		].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
		const start = input.before === undefined ? 0 : items.findIndex((item) => cursorOf(item) === input.before) + 1;
		const page = items.slice(start, start + input.limit);
		const last = page[page.length - 1];
		return {
			items: page,
			nextCursor: last !== undefined && start + input.limit < items.length ? cursorOf(last) : null,
		};
	}),
};
