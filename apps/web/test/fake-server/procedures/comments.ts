import { type ActorRef, EVENT_BODY_LIMIT, type TimelineItem } from "@trellis/api";
import { fail } from "../fail";
import { os } from "../implementer";
import {
	identifierOf,
	isoNow,
	newId,
	requireTicket,
	requireWritable,
	type State,
	type TicketRow,
	touchActor,
} from "../state";

// Comments and the timeline. A comment is user-visible activity, so the
// ticket's version and updatedAt move with it.

const requireComment = (state: Parameters<typeof requireTicket>[0], id: string) => {
	const comment = state.comments.get(id);
	if (comment === undefined) throw fail("NOT_FOUND", { kind: "comment", ref: id });
	return comment;
};

// The content a comment event carries. The real server sends the ticket, the
// actor, and the text on every comment event, so a reader acts on the event
// and makes no second call.
const commentContent = (state: State, ticket: TicketRow, comment: { id: string; body: string; actor: ActorRef }) => ({
	id: comment.id,
	ticketId: ticket.id,
	ticketIdentifier: identifierOf(state, ticket),
	ticketTitle: ticket.title,
	actor: comment.actor,
	body: comment.body.slice(0, EVENT_BODY_LIMIT),
	bodyTruncated: comment.body.length > EVENT_BODY_LIMIT,
});

const cursorOf = (item: TimelineItem) => `${item.createdAt}|${item.kind}|${item.id}`;

export const comments = {
	thread: os.comments.thread.handler(({ context, input }) => {
		const comment = requireComment(context.state, input.id);
		const root = requireComment(context.state, comment.parentId ?? comment.id);
		const replies = [...context.state.comments.values()]
			.filter((item) => item.parentId === root.id)
			.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
		return { root, replies };
	}),
	resolve: os.comments.resolve.handler(({ context, input }) => {
		const comment = requireComment(context.state, input.id);
		const root = requireComment(context.state, comment.parentId ?? comment.id);
		const ticket = context.state.tickets.get(root.ticketId)!;
		requireWritable(context.state, ticket.projectId);
		root.resolvedAt = input.resolved ? isoNow() : null;
		root.updatedAt = isoNow();
		context.bus.emit("comment.updated", commentContent(context.state, ticket, root), {
			ticketId: ticket.id,
			projectId: ticket.projectId,
		});
		return root;
	}),
	create: os.comments.create.handler(({ context, input }) => {
		const { state, bus } = context;
		const ticket = requireTicket(state, input.ticket);
		requireWritable(state, ticket.projectId);
		const at = isoNow();
		const parent = input.parentId === undefined ? null : requireComment(state, input.parentId);
		if (parent !== null && parent.ticketId !== ticket.id) throw fail("COMMENT_PARENT_MISMATCH", undefined);
		const comment = {
			id: newId(),
			ticketId: ticket.id,
			parentId: parent === null ? null : (parent.parentId ?? parent.id),
			resolvedAt: null,
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
		bus.emit("comment.created", commentContent(state, ticket, comment), {
			ticketId: ticket.id,
			projectId: ticket.projectId,
		});
		context.resHeaders.set("location", `/api/comments/${comment.id}`);
		return comment;
	}),
	update: os.comments.update.handler(({ context, input }) => {
		const { state, bus } = context;
		const comment = requireComment(state, input.id);
		comment.body = input.body;
		comment.updatedAt = isoNow();
		const ticket = state.tickets.get(comment.ticketId)!;
		bus.emit("comment.updated", commentContent(state, ticket, comment), {
			ticketId: ticket.id,
			projectId: ticket.projectId,
		});
		return comment;
	}),
	delete: os.comments.delete.handler(({ context, input }) => {
		const { state, bus } = context;
		const comment = requireComment(state, input.id);
		if ([...state.comments.values()].some((item) => item.parentId === comment.id))
			throw fail("COMMENT_HAS_REPLIES", undefined);
		state.comments.delete(comment.id);
		const ticket = state.tickets.get(comment.ticketId)!;
		ticket.version += 1;
		ticket.updatedAt = isoNow();
		bus.emit("comment.deleted", commentContent(state, ticket, comment), {
			ticketId: ticket.id,
			projectId: ticket.projectId,
		});
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
