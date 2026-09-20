import { z } from "zod";
import { EpicRefStringSchema, TicketRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { EPIC_DESCRIPTION_MAX } from "./epic.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const ResourceKindSchema = z.enum(["doc", "link", "image", "file"]);
export type ResourceKind = z.infer<typeof ResourceKindSchema>;

export const ResourceNameSchema = z
	.string()
	.trim()
	.min(1, "Enter a resource name.")
	.max(255, "Enter a resource name of 255 characters or less.");

export const ResourceUrlSchema = z
	.url()
	.max(10000)
	.refine((value) => ["http:", "https:"].includes(URL.parse(value)?.protocol ?? ""), "Enter an HTTP or HTTPS URL.");

export const ResourceBlobSchema = z.object({
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	url: z.string().min(1),
	size: z.number().int().nonnegative(),
});

export const ResourceSchema = z.object({
	id: UlidSchema,
	epicId: UlidSchema,
	kind: ResourceKindSchema,
	name: z.string().min(1).max(255),
	body: z.string().nullable(),
	url: z.string().nullable(),
	blob: ResourceBlobSchema.nullable(),
	ticketId: UlidSchema.nullable(),
	pullRequestNumber: z.number().int().positive().nullable(),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type Resource = z.infer<typeof ResourceSchema>;

const addBase = {
	epic: EpicRefStringSchema,
	name: ResourceNameSchema,
	ticket: TicketRefStringSchema.optional(),
};

export const ResourceAddInputSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		...addBase,
		kind: z.literal("doc"),
		body: z.string().max(EPIC_DESCRIPTION_MAX),
	}),
	z.strictObject({ ...addBase, kind: z.literal("link"), url: ResourceUrlSchema }),
	z.strictObject({ ...addBase, kind: z.literal("image"), file: z.file().min(1) }),
	z.strictObject({ ...addBase, kind: z.literal("file"), file: z.file().min(1) }),
]);
export type ResourceAddInput = z.input<typeof ResourceAddInputSchema>;

export const ResourceListInputSchema = z.strictObject({
	epic: EpicRefStringSchema,
});

export const ResourceIdInputSchema = z.strictObject({
	id: UlidSchema,
});

export const ResourceRemoveOutputSchema = z.object({
	deleted: UlidSchema,
});
