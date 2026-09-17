import { z } from "zod";
import { managerWait } from "./managerWait.ts";

export const managerNextAction = z.object({
	id: z.string(),
	projectId: z.string(),
	ticketId: z.string(),
	assignmentRequestId: z.string(),
	reason: z.string(),
	wakeCondition: z.enum(["ready", "time", "dependency", "human_response"]),
	waitFor: managerWait.nullish(),
	state: z.enum(["waiting", "assigned", "canceled"]),
	runId: z.string().nullable(),
	createdAt: z.string(),
	eligibleAt: z.string().nullable(),
	assignedAt: z.string().nullable(),
});
export type ManagerNextAction = z.infer<typeof managerNextAction>;
