import type { Comment } from "@trellis/api";
import { mentionSlugs } from "../services/agentRuns/mentionSlugs.ts";
import { call, os, setLocation } from "./base.ts";

export const comments = os.comments.router({
	thread: os.comments.thread.handler(({ context, input }) => call(context, "comments.thread", input)),
	resolve: os.comments.resolve.handler(({ context, input }) => call(context, "comments.resolve", input)),
	create: os.comments.create.handler(async ({ context, input }) => {
		const comment = await call<Comment>(context, "comments.create", input);
		setLocation(context, `/api/comments/${comment.id}`);
		// A mention starts the persona it names, or reaches the agent of that
		// persona that already runs on this ticket. A body with no mention
		// costs one regular expression and no service call.
		//
		// Only a comment by a human runs the mention path. Two agents that
		// mention each other would otherwise send each other text with no end,
		// and the concurrency limit bounds the live runs, not the total.
		//
		// The call runs without a wait, so the person who wrote the comment
		// reads it back at once. A start launches a local agent process, and a
		// body that names two personas starts them one after the other, so a
		// wait here would hold the response open for every launch. The
		// comment is committed already, so nothing in the response needs the
		// launch. Every refusal the mention path can report becomes a reply on
		// the ticket, and `transport.settle()` waits for the call.
		if (comment.actor.kind === "human" && mentionSlugs(comment.body).length > 0)
			void call(context, "agentRuns.mention", {
				ticket: comment.ticketId,
				commentId: comment.id,
				body: comment.body,
			}).catch(() => undefined);
		return comment;
	}),
	update: os.comments.update.handler(({ context, input }) => call(context, "comments.update", input)),
	delete: os.comments.delete.handler(({ context, input }) => call(context, "comments.delete", input)),
});
