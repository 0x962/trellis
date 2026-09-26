import { z } from "zod";
import { AgentRunKindSchema } from "./agentRun.ts";
import { CountSchema, UlidSchema } from "./primitives.ts";

export const AgentBroadcastGroupSchema = z.enum(["working", "idle"]);
export type AgentBroadcastGroup = z.infer<typeof AgentBroadcastGroupSchema>;

export const AgentBroadcastRecipientSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	kind: AgentRunKindSchema,
	projectKey: z.string(),
	ticketIdentifier: z.string().nullable(),
});
export type AgentBroadcastRecipient = z.infer<typeof AgentBroadcastRecipientSchema>;

export const AgentBroadcastCountsSchema = z.object({
	working: CountSchema,
	idle: CountSchema,
});
export type AgentBroadcastCounts = z.infer<typeof AgentBroadcastCountsSchema>;

export const AgentBroadcastInputSchema = z.strictObject({
	group: AgentBroadcastGroupSchema,
	text: z.string().trim().min(1).max(20000),
	requestId: z
		.string()
		.min(1)
		.max(80)
		.regex(/^[a-zA-Z0-9_-]+$/),
});
export type AgentBroadcastInput = z.infer<typeof AgentBroadcastInputSchema>;

export const AgentBroadcastResultSchema = z.object({
	group: AgentBroadcastGroupSchema,
	recipientCount: CountSchema,
	acceptedCount: CountSchema,
	failures: z.array(
		z.object({
			recipient: AgentBroadcastRecipientSchema,
			reason: z.string(),
		}),
	),
});
export type AgentBroadcastResult = z.infer<typeof AgentBroadcastResultSchema>;
