import { z } from "zod";
import { IsoDateTimeSchema, UlidSchema } from "./primitives.ts";

const locator = {
	source: z.enum(["legacy", "persona"]),
	id: UlidSchema,
	runtime: z.enum(["superset", "tmux", "commands"]),
	workspaceId: z.string().min(1).max(4096).nullable(),
	terminalId: z.string().min(1).max(200).nullable(),
	sessionId: z.string().min(1).max(200).nullable(),
};
export const ExternalRetirementInputSchema = z.strictObject({ ...locator, externalProcessStopped: z.literal(true) });
export type ExternalRetirementInput = z.infer<typeof ExternalRetirementInputSchema>;
export const ExternalRetirementSchema = z.object({
	...locator,
	hostId: z.string().nullable(),
	retiredAt: IsoDateTimeSchema,
	actorName: z.string(),
});
export type ExternalRetirement = z.infer<typeof ExternalRetirementSchema>;
