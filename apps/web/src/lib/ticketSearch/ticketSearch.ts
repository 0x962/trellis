import { UlidSchema } from "@trellis/api";
import { z } from "zod";

export const TicketTabSchema = z.enum(["activity", "agent", "changes", "flows"]);
export type TicketTab = z.infer<typeof TicketTabSchema>;

export const TicketSearchSchema = z.object({
	thread: UlidSchema.optional().catch(undefined),
	tab: TicketTabSchema.optional().catch(undefined),
});

export const ticketTab = (tab: TicketTab | undefined, hash: string): TicketTab =>
	tab ?? (hash.startsWith("attempt-") ? "agent" : "activity");
