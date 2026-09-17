import { z } from "zod";

export const managerWait = z.discriminatedUnion("type", [
	z.object({ type: z.literal("time"), at: z.iso.datetime({ offset: true }) }),
	z.object({ type: z.literal("dependency"), ticketId: z.string().min(1) }),
	z.object({ type: z.literal("human_response"), commentId: z.string().min(1) }),
]);
export type ManagerWait = z.infer<typeof managerWait>;
