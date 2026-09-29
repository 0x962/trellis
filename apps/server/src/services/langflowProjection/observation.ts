import { FlowNodeKindSchema, FlowStepStateSchema, IsoDateTimeSchema } from "@trellis/api";
import { z } from "zod";
import { EngineCheckpointV1Schema, FailureV1Schema, OccurrenceV1Schema } from "../../langflowContracts";

export const ProjectionObservationSchema = z
	.strictObject({
		expectedRevision: z.int().positive(),
		checkpoint: EngineCheckpointV1Schema,
		status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
		failure: FailureV1Schema.nullable(),
		occurrences: z.array(
			OccurrenceV1Schema.extend({
				kind: FlowNodeKindSchema,
				reviewArea: z.enum(["frontend", "backend"]).nullable(),
				acceptedResultId: z.string().min(1).nullable(),
				title: z.string(),
				instruction: z.string(),
				actionKey: z.string().min(1),
				state: FlowStepStateSchema,
				error: z.string().nullable(),
				skipReason: z.string().nullable(),
				startedAt: IsoDateTimeSchema.nullable(),
				endedAt: IsoDateTimeSchema.nullable(),
				deadlineRefs: z.array(z.string().min(1)),
			}),
		),
	})
	.superRefine((value, ctx) => {
		if ((value.status === "failed") !== (value.failure !== null)) {
			ctx.addIssue({ code: "custom", message: "A failed engine snapshot requires its failure classification." });
		}
		const keys = value.occurrences.map((row) => row.occurrenceKey);
		if (new Set(keys).size !== keys.length) {
			ctx.addIssue({ code: "custom", message: "An engine snapshot must have unique occurrence keys." });
		}
	});

export type ProjectionObservation = z.infer<typeof ProjectionObservationSchema>;
export type ObservedOccurrence = ProjectionObservation["occurrences"][number];
