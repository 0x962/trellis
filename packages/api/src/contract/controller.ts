import { z } from "zod";
import { UlidSchema } from "../schemas/primitives.ts";
import { base } from "./base.ts";

const dispatch = z.object({
	id: z.string(),
	projectId: UlidSchema,
	runId: z.string().nullable(),
	terminalId: z.string().nullable(),
	sessionId: z.string().nullable(),
	generation: z.number(),
	state: z.enum(["pending", "sending", "sent", "unknown", "cancelled"]),
	events: z.array(
		z.object({
			id: z.number(),
			ticketId: z.string(),
			action: z.string(),
			actor: z.object({ name: z.string(), kind: z.string() }),
			createdAt: z.string(),
		}),
	),
	dueAt: z.string(),
	error: z.string().nullable(),
	resolution: z
		.object({
			kind: z.literal("cancelled"),
			receipt: z.literal("unknown"),
			generation: z.number().int(),
			reason: z.string(),
			actor: z.object({ kind: z.literal("human"), name: z.string() }),
			at: z.string(),
		})
		.nullable()
		.optional(),
});
const idInput = z.object({ id: z.string().min(1) });
export const controller = {
	cancel: base
		.route({
			method: "POST",
			path: "/manager-dispatches/{id}/cancel",
			summary: "Cancel an uncertain manager delivery without confirming receipt",
		})
		.input(
			idInput.extend({
				expectedGeneration: z.number().int().nonnegative(),
				reason: z.string().trim().min(1).max(2000),
			}),
		)
		.output(dispatch),
	list: base
		.route({ method: "GET", path: "/manager-dispatches", summary: "Read the manager queue" })
		.input(z.object({ projectId: UlidSchema.optional() }))
		.output(z.array(dispatch)),
	retry: base
		.route({ method: "POST", path: "/manager-dispatches/{id}/retry", summary: "Resend an uncertain manager message" })
		.input(idInput)
		.output(dispatch),
	resolveUnknown: base
		.route({
			method: "POST",
			path: "/manager-dispatches/{id}/received",
			summary: "Confirm the manager received a message",
		})
		.input(idInput)
		.output(dispatch),
};
