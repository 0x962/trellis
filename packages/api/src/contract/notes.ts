import { z } from "zod";
import { pickErrors } from "../errors.ts";
import {
	NoteCreateInputSchema,
	NoteIdInputSchema,
	NoteListInputSchema,
	NoteSchema,
	NoteUpdateInputSchema,
} from "../schemas/note.ts";
import { base } from "./base.ts";

const write = pickErrors(["PROJECT_ARCHIVED", "DUPLICATE"]);

export const notes = {
	list: base
		.route({
			method: "GET",
			path: "/projects/{project}/notes",
			summary: "List the notes of a project and its ancestors",
		})
		.input(NoteListInputSchema)
		.output(z.array(NoteSchema)),
	create: base
		.errors(write)
		.route({ method: "POST", path: "/projects/{project}/notes", successStatus: 201, summary: "Create a note" })
		.input(NoteCreateInputSchema)
		.output(NoteSchema),
	get: base
		.route({ method: "GET", path: "/notes/{id}", summary: "Read one note" })
		.input(NoteIdInputSchema)
		.output(NoteSchema),
	update: base
		.errors(write)
		.route({ method: "PATCH", path: "/notes/{id}", summary: "Update a note" })
		.input(NoteUpdateInputSchema)
		.output(NoteSchema),
	delete: base
		.errors(pickErrors(["PROJECT_ARCHIVED"]))
		.route({ method: "DELETE", path: "/notes/{id}", summary: "Delete a note" })
		.input(NoteIdInputSchema)
		.output(NoteIdInputSchema),
};
