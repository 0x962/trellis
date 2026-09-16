import type { Note } from "@trellis/api";
import { call, os, setLocation } from "./base.ts";

export const notes = os.notes.router({
	list: os.notes.list.handler(({ context, input }) => call(context, "notes.list", input)),
	get: os.notes.get.handler(({ context, input }) => call(context, "notes.get", input)),
	create: os.notes.create.handler(async ({ context, input }) => {
		const note = await call<Note>(context, "notes.create", input);
		setLocation(context, `/api/notes/${note.id}`);
		return note;
	}),
	update: os.notes.update.handler(({ context, input }) => call(context, "notes.update", input)),
	delete: os.notes.delete.handler(({ context, input }) => call(context, "notes.delete", input)),
});
