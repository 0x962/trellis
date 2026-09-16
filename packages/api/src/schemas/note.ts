import { z } from "zod";
import { ProjectRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { booleanString, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// A note is a titled markdown text that belongs to a project and reaches
// every agent of that project and its sub-projects at start. A human or an
// agent writes one for the agents that come later: a fact about the
// repository or the machine, the current state of a shared resource, or a
// decision that later work must respect.

// Who reads a note. `all` reaches every agent, `manager` the manager alone,
// `worker` builders and reviewers alone.
export const NoteAudienceSchema = z.enum(["all", "manager", "worker"]);
export type NoteAudience = z.infer<typeof NoteAudienceSchema>;

export const NOTE_TITLE_MAX = 120;
export const NOTE_BODY_MAX = 4000;

// Two notes of one project never share a title, compared without case, so a
// writer that repeats a title gets DUPLICATE and updates the note instead.
export const NoteTitleSchema = z.string().trim().min(1).max(NOTE_TITLE_MAX);
export const NoteBodySchema = z.string().trim().min(1).max(NOTE_BODY_MAX);

// `expiresAt` marks a note about a passing state, such as free disk or an
// active release. An expired note leaves every list and every launch
// prompt on its own; nobody has to delete it.
export const NoteSchema = z.object({
	id: UlidSchema,
	projectId: UlidSchema,
	projectPath: z.string().min(1),
	title: z.string(),
	body: z.string(),
	audience: NoteAudienceSchema,
	expiresAt: IsoDateTimeSchema.nullable(),
	// The last writer of the note.
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Note = z.infer<typeof NoteSchema>;

// The notes of a project and of every ancestor, newest change first. An
// `audience` filter keeps the notes that audience reads: its own and `all`.
export const NoteListInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	audience: NoteAudienceSchema.optional(),
	includeExpired: booleanString.default(false),
});
export type NoteListInput = z.input<typeof NoteListInputSchema>;

export const NoteCreateInputSchema = z.strictObject({
	project: ProjectRefStringSchema,
	title: NoteTitleSchema,
	body: NoteBodySchema,
	audience: NoteAudienceSchema.default("all"),
	expiresAt: IsoDateTimeSchema.nullable().default(null),
});
export type NoteCreateInput = z.input<typeof NoteCreateInputSchema>;

// A field that is absent keeps its value. `expiresAt: null` removes the expiry.
export const NoteUpdateInputSchema = z.strictObject({
	id: UlidSchema,
	title: NoteTitleSchema.optional(),
	body: NoteBodySchema.optional(),
	audience: NoteAudienceSchema.optional(),
	expiresAt: IsoDateTimeSchema.nullable().optional(),
});
export type NoteUpdateInput = z.input<typeof NoteUpdateInputSchema>;

export const NoteIdInputSchema = z.strictObject({ id: UlidSchema });
export type NoteIdInput = z.input<typeof NoteIdInputSchema>;
