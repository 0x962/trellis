import { isAbsolute } from "node:path";
import {
	FlowExecutionStartInputSchema,
	FlowOccurrenceIdentityV1Schema,
	UlidSchema,
} from "@trellis/api";
import { z } from "zod";
import { LoadQualifiedPackageInputSchema } from "../../../../release";

const path = z.string().refine(isAbsolute);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const visit = FlowOccurrenceIdentityV1Schema.omit({ occurrenceKey: true, parentOccurrenceKey: true });
const decision = z.strictObject({ visit, approved: z.boolean(), output: z.string() });
const expectedOccurrence = z.strictObject({
	visit,
	parentVisit: visit.nullable(),
	state: z.enum(["succeeded", "skipped", "failed", "canceled"]),
	outputSha256: hash.nullable(),
	nativeResult: z.boolean(),
});

export const BatchInputSchema = z.strictObject({
	version: z.literal(1),
	sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
	qualification: LoadQualifiedPackageInputSchema,
	authenticationFile: path,
	actor: z.string().regex(/^human:[^:\r\n]+$/),
	apiOrigin: z.url().refine((value) => {
		const url = new URL(value);
		return ["http:", "https:"].includes(url.protocol) && url.origin === value;
	}),
	deadlineAt: z.iso.datetime(),
	pollIntervalMs: z.number().int().positive(),
	requestTimeoutMs: z.number().int().positive(),
	prerequisites: z.strictObject({
		bootstrapConfiguration: z.strictObject({ path, sha256: hash }),
		bootReceipt: z.strictObject({ path, sha256: hash }),
		nativeAdapterReceipt: z.strictObject({ path, sha256: hash }),
		cleanupCommandFile: z.strictObject({ path, sha256: hash }),
		matchedSeries: z.strictObject({ path, sha256: hash }),
	}),
	scenarios: z.array(z.strictObject({
		name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
		start: FlowExecutionStartInputSchema,
		ticketId: UlidSchema,
		projectId: UlidSchema,
		documentHash: hash,
		decisions: z.array(decision),
		cancelAt: visit.nullable(),
		expectedStatus: z.enum(["succeeded", "failed", "canceled"]),
		expectedOccurrences: z.array(expectedOccurrence).min(1),
	})).min(1),
});

export type BatchInput = z.infer<typeof BatchInputSchema>;
export type Scenario = BatchInput["scenarios"][number];
