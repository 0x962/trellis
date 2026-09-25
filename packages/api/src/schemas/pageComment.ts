import { z } from "zod";
import { PageRefStringSchema } from "../refs.ts";
import { ActorRefSchema } from "./actor.ts";
import { PageVersionNumberSchema } from "./page.ts";
import { booleanString, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const PAGE_COMMENT_BODY_MAX = 10000;
export const PAGE_COMMENT_ANCHOR_MAX_BYTES = 16 * 1024;
export const PageCommentBodySchema = z
	.string()
	.trim()
	.min(1, "Enter a comment.")
	.max(PAGE_COMMENT_BODY_MAX, `Enter a comment of ${PAGE_COMMENT_BODY_MAX} characters or less.`);
const pageDomPathPattern =
	/^[a-z\p{L}][a-z0-9\p{L}\p{N}-]*(?::nth-of-type\([1-9]\d*\))?(?:>[a-z\p{L}][a-z0-9\p{L}\p{N}-]*(?::nth-of-type\([1-9]\d*\))?)*$/u;
const PageDomPathSchema = z
	.string()
	.min(1)
	.max(4000)
	.regex(pageDomPathPattern, "A Page element path must contain tag names and optional nth-of-type positions.");

// PostgreSQL renders JSONB with one space after each colon and comma. These
// flat strict objects have one colon per property and one fewer comma.
const jsonbTextByteLength = (value: Record<string, unknown>) =>
	new TextEncoder().encode(JSON.stringify(value)).byteLength + Object.keys(value).length * 2 - 1;

export const PageCommentAnchorSchema = z
	.discriminatedUnion("kind", [
		z.strictObject({ kind: z.literal("element"), path: PageDomPathSchema }),
		z.strictObject({
			kind: z.literal("text"),
			path: PageDomPathSchema,
			quote: z.string().min(1).max(2000),
			prefix: z.string().max(32),
			suffix: z.string().max(32),
		}),
	])
	.refine(
		(anchor) => jsonbTextByteLength(anchor) <= PAGE_COMMENT_ANCHOR_MAX_BYTES,
		`A page comment anchor cannot exceed ${PAGE_COMMENT_ANCHOR_MAX_BYTES} bytes.`,
	);
export type PageCommentAnchor = z.infer<typeof PageCommentAnchorSchema>;

export const PageCommentSchema = z.object({
	id: UlidSchema,
	threadId: UlidSchema,
	body: PageCommentBodySchema,
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
	deletedAt: IsoDateTimeSchema.nullable(),
});
export type PageComment = z.infer<typeof PageCommentSchema>;

export const PageCommentThreadSchema = z
	.object({
		id: UlidSchema,
		pageId: UlidSchema,
		version: PageVersionNumberSchema,
		anchor: PageCommentAnchorSchema,
		selectedText: z.string().min(1).max(2000).nullable(),
		creator: ActorRefSchema,
		resolved: z.object({ actor: ActorRefSchema, at: IsoDateTimeSchema }).nullable(),
		comments: z.array(PageCommentSchema).min(1),
		createdAt: IsoDateTimeSchema,
		updatedAt: IsoDateTimeSchema,
	})
	.superRefine((thread, ctx) => {
		if (thread.anchor.kind === "text" && thread.selectedText === null) {
			ctx.addIssue({ code: "custom", path: ["selectedText"], message: "A text anchor needs selected text." });
		}
		if (thread.anchor.kind === "element" && thread.selectedText !== null) {
			ctx.addIssue({ code: "custom", path: ["selectedText"], message: "An element anchor cannot have selected text." });
		}
	});
export type PageCommentThread = z.infer<typeof PageCommentThreadSchema>;

export const PageCommentListInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionNumberSchema.optional(),
	resolved: booleanString.optional(),
});

export const PageCommentCreateInputSchema = z.strictObject({
	page: PageRefStringSchema,
	version: PageVersionNumberSchema,
	anchor: PageCommentAnchorSchema,
	body: PageCommentBodySchema,
});

export const PageCommentReplyInputSchema = z.strictObject({
	thread: UlidSchema,
	body: PageCommentBodySchema,
});

export const PageCommentResolveInputSchema = z.strictObject({
	thread: UlidSchema,
	resolved: z.boolean(),
});

export const PageCommentEditInputSchema = z.strictObject({
	id: UlidSchema,
	body: PageCommentBodySchema,
});

export const PageCommentIdInputSchema = z.strictObject({ id: UlidSchema });

export const PageCommentRemoveOutputSchema = z.object({ deleted: UlidSchema });
