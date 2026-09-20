import { z } from "zod";
import { ActorRefSchema } from "./actor.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const EvidenceKindSchema = z.enum([
	"before",
	"after",
	"clip",
	"console",
	"verify",
	"test",
	"contract",
	"migration",
	"picture",
	"equivalence",
]);
export type EvidenceKind = z.infer<typeof EvidenceKindSchema>;

export const EvidenceBlobSchema = z.object({
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	url: z.string().min(1),
	filename: z.string().min(1),
	mime: z.string().min(1),
	size: z.number().int().nonnegative(),
});

export const EvidenceStoredFileSchema = EvidenceBlobSchema.pick({ filename: true, mime: true, size: true });

export const EvidenceSchema = z.object({
	id: UlidSchema,
	pullRequestId: UlidSchema,
	headSha: z.string().min(1).max(64),
	kind: EvidenceKindSchema,
	record: z.record(z.string(), z.json()),
	blob: EvidenceBlobSchema.nullable(),
	actor: ActorRefSchema,
	createdAt: IsoDateTimeSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const EvidenceIdInputSchema = z.strictObject({
	evidenceId: UlidSchema,
});

const writeBase = {
	id: UlidSchema,
	evidenceId: UlidSchema,
	headSha: z.string().min(1).max(64),
};

const captureRecord = {
	route: z.string().min(1),
	viewport: z.string().min(1),
	theme: z.string().min(1),
	seed: z.string().min(1),
	browser: z.string().min(1),
};

export const EvidenceWriteInputSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		...writeBase,
		kind: z.literal("before"),
		record: z.strictObject({ ...captureRecord, base: z.string().min(1).max(64) }),
		file: z.file(),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("after"),
		record: z.strictObject(captureRecord),
		file: z.file(),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("clip"),
		record: z.strictObject({ route: z.string().min(1), caption: z.string().min(1) }),
		file: z.file(),
	}),
	z.strictObject({ ...writeBase, kind: z.literal("console"), record: z.strictObject({}), file: z.file() }),
	z.strictObject({
		...writeBase,
		kind: z.literal("verify"),
		record: z.strictObject({ command: z.string().min(1), exit: z.number().int(), tail: z.string() }),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("test"),
		record: z.union([
			z.strictObject({ name: z.string().min(1), failsOn: z.string().min(1), passesOn: z.string().min(1) }),
			z.strictObject({ none: z.literal(true), reason: z.string().min(1) }),
		]),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("contract"),
		record: z.union([
			z.strictObject({ before: z.string(), after: z.string() }),
			z.strictObject({ none: z.literal(true) }),
		]),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("migration"),
		record: z.union([z.strictObject({}), z.strictObject({ table: z.string().min(1) })]),
		file: z.file().optional(),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("picture"),
		record: z.strictObject({ why: z.string().min(1) }),
		file: z.file(),
	}),
	z.strictObject({
		...writeBase,
		kind: z.literal("equivalence"),
		record: z.strictObject({ command: z.string().min(1), exit: z.number().int(), tail: z.string() }),
	}),
]);
