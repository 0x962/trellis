import { z } from "zod";
import { ReferenceSchema, TimestampSchema } from "../primitives";

const deadline = {
	deadlineId: ReferenceSchema,
	groupOccurrenceKey: ReferenceSchema,
	budgetMs: z.int().min(1).max(86_400_000),
};
export const GroupDeadlineV1Schema = z.union([
	z.strictObject({ ...deadline, launchedAt: z.null(), deadlineAt: z.null(), launchReceiptId: z.null() }),
	z
		.strictObject({
			...deadline,
			launchedAt: TimestampSchema,
			deadlineAt: TimestampSchema,
			launchReceiptId: ReferenceSchema,
		})
		.refine(
			(value) => Date.parse(value.deadlineAt) === Date.parse(value.launchedAt) + value.budgetMs,
			"The deadline must use the observed launch time and group budget.",
		),
]);
export type GroupDeadlineV1 = z.infer<typeof GroupDeadlineV1Schema>;
