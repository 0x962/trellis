import type { SessionDetail } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const sessions = os.sessions.router({
	activity: os.sessions.activity.handler(({ context, input }) => call(context, "sessions.activity", input)),
	list: os.sessions.list.handler(({ context, input }) => call(context, "sessions.list", input)),
	get: os.sessions.get.handler(({ context, input }) => call(context, "sessions.get", input)),
	create: os.sessions.create.handler(async ({ context, input }) => {
		const session = await call<SessionDetail>(context, "sessions.create", input);
		setLocation(context, `/api/sessions/${session.id}`);
		return session;
	}),
	start: os.sessions.start.handler(({ context, input }) => call(context, "sessions.start", input)),
	move: os.sessions.move.handler(({ context, input }) => call(context, "sessions.move", input)),
	rename: os.sessions.rename.handler(({ context, input }) => call(context, "sessions.rename", input)),
	setArchived: os.sessions.setArchived.handler(({ context, input }) => call(context, "sessions.setArchived", input)),
	delete: os.sessions.delete.handler(({ context, input }) => call(context, "sessions.delete", input)),
});
