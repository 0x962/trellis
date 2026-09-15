import { z } from "zod";
import { GhReasonSchema } from "./enums.ts";
import { CountSchema, IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

// `checkedAt` is null until the first gh check after boot finishes.
export const GhStatusSchema = z.object({
	ok: z.boolean(),
	user: z.string().nullable(),
	reason: GhReasonSchema.nullable(),
	message: z.string().nullable(),
	checkedAt: IsoDateTimeSchema.nullable(),
});
export type GhStatus = z.infer<typeof GhStatusSchema>;

// The checkout the server runs from, and the commit at the HEAD of that
// checkout when the server started. `commit` is null when the checkout is
// not a git work tree.
export const ServerSourceSchema = z.object({
	checkout: z.string(),
	commit: z.string().nullable(),
});
export type ServerSource = z.infer<typeof ServerSourceSchema>;

// `bootId` changes on every server start; event ids carry it. A server of an
// earlier release sends no `source`, and the phone app still reads its health.
export const HealthSchema = z.object({
	ok: z.boolean(),
	version: z.string(),
	apiVersion: z.string(),
	bootId: UlidSchema,
	rss: CountSchema,
	// Every URL the server answers on, network addresses first. A phone can
	// reach only an address that is not loopback.
	addresses: z.array(z.string()),
	db: z.object({
		ok: z.boolean(),
		sizeBytes: CountSchema,
	}),
	gh: GhStatusSchema,
	source: ServerSourceSchema.optional(),
});
export type Health = z.infer<typeof HealthSchema>;

export const BackupOutputSchema = z.object({
	path: z.string().min(1),
	bytes: CountSchema,
});
export type BackupOutput = z.infer<typeof BackupOutputSchema>;
