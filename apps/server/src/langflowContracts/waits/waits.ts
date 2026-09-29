import { z } from "zod";
import { HumanWaitV1Schema } from "../human";
import { NativeHandleV1Schema, NativeRequestV1Schema } from "../native";
import { BindingV1Schema, ReferenceSchema, RevisionSchema } from "../primitives";

export const ExternalWaitV1Schema = z.discriminatedUnion("kind", [
	z.strictObject({
		kind: z.literal("native"),
		waitId: ReferenceSchema,
		request: NativeRequestV1Schema,
		handle: NativeHandleV1Schema,
	}),
	z.strictObject({ kind: z.literal("human"), waitId: ReferenceSchema, request: HumanWaitV1Schema }),
	z.strictObject({ kind: z.literal("admission"), waitId: ReferenceSchema, barrierId: ReferenceSchema }),
]);
export const EngineCheckpointV1Schema = z
	.strictObject({
		version: z.literal(1),
		...BindingV1Schema.shape,
		checkpointId: ReferenceSchema,
		revision: RevisionSchema,
		continuationRef: ReferenceSchema,
		waits: z.array(ExternalWaitV1Schema),
	})
	.refine(
		(checkpoint) =>
			new Set(checkpoint.waits.map((wait) => wait.waitId)).size === checkpoint.waits.length &&
			checkpoint.waits.every(
				(wait) =>
					wait.kind === "admission" ||
					(wait.request.executionId === checkpoint.executionId &&
						wait.request.publicationId === checkpoint.publicationId &&
						wait.request.engineJobId === checkpoint.engineJobId &&
						wait.request.engineEpoch <= checkpoint.engineEpoch),
			),
		"Checkpoint waits must have unique identities and retain their execution, publication, and job.",
	);
export type ExternalWaitV1 = z.infer<typeof ExternalWaitV1Schema>;
export type EngineCheckpointV1 = z.infer<typeof EngineCheckpointV1Schema>;
