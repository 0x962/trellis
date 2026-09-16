import { z } from "zod";

export const managerNextAction = z.object({
	id: z.string(),
	projectId: z.string(),
	ticketId: z.string(),
	assignmentRequestId: z.string(),
	reason: z.string(),
	wakeCondition: z.literal("capacity"),
	state: z.enum(["waiting", "assigned", "canceled"]),
	runId: z.string().nullable(),
	createdAt: z.string(),
	eligibleAt: z.string().nullable(),
	assignedAt: z.string().nullable(),
});
export type ManagerNextAction = z.infer<typeof managerNextAction>;
