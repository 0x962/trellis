import type { Comment } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const comments = os.comments.router({
	create: os.comments.create.handler(async ({ context, input }) => {
		const comment = await call<Comment>(context, "comments.create", input);
		setLocation(context, `/api/comments/${comment.id}`);
		return comment;
	}),
	update: os.comments.update.handler(({ context, input }) => call(context, "comments.update", input)),
	delete: os.comments.delete.handler(({ context, input }) => call(context, "comments.delete", input)),
});
