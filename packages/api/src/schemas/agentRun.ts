import { z } from "zod";
import { PersonaKindSchema } from "./persona.ts";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

export const AgentRunSchema = z.object({
	id: UlidSchema,
	name: z.string(),
	runtime: z.enum(["superset", "tmux"]),
	personaId: UlidSchema.nullable(),
	personaName: z.string(),
	kind: PersonaKindSchema,
	instruction: z.string(),
	projectId: UlidSchema.nullable(),
	projectPath: z.string(),
	ticketId: UlidSchema.nullable(),
	ticketIdentifier: z.string().nullable(),
	state: z.enum(["starting", "interrupted", "running", "failed", "stopped", "exited"]),
	workspaceId: z.string().nullable(),
	terminalId: z.string().nullable(),
	url: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: IsoDateTimeSchema,
	updatedAt: IsoDateTimeSchema,
});
export type AgentRun = z.infer<typeof AgentRunSchema>;
export const AgentRunStartInputSchema = z
	.strictObject({
		personaId: UlidSchema,
		ticket: z.string().min(1).optional(),
		project: z.string().min(1).optional(),
	})
	.refine((input) => (input.ticket === undefined) !== (input.project === undefined), "Select one ticket or project.");
export type AgentRunStartInput = z.infer<typeof AgentRunStartInputSchema>;
export const AgentRunListInputSchema = z.strictObject({
	ticket: z.string().optional(),
	project: z.string().optional(),
});
export type AgentRunListInput = z.infer<typeof AgentRunListInputSchema>;
