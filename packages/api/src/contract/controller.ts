import { z } from "zod";
import { UlidSchema } from "../schemas/primitives.ts";
import { base } from "./base.ts";
import { managerNextAction } from "./managerNextAction.ts";

const outcome = z.object({
	ticketId: z.string().min(1).nullable(),
	status: z
		.enum(["assigned", "queued", "blocked", "no_action"])
		.describe(
			"queued saves a capacity wait for a ticket; blocked records another prerequisite. Use the next action assignmentRequestId to start its worker.",
		),
	reference: z.string().min(1).max(2000).optional(),
	reason: z.string().trim().min(1).max(2000),
});
const dispatch = z.object({
	id: z.string(),
	projectId: UlidSchema,
	runId: z.string().nullable(),
	terminalId: z.string().nullable(),
	sessionId: z.string().nullable(),
	generation: z.number(),
	state: z.enum(["pending", "sending", "sent", "unknown"]),
	workState: z.enum(["untracked", "open", "handled"]),
	outcomes: z.array(outcome),
	nextActions: z.array(managerNextAction),
	handledAt: z.string().nullable(),
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
});
const idInput = z.object({ id: z.string().min(1) });
export const controller = {
	actions: base
		.route({
			method: "GET",
			path: "/manager-actions",
			summary: "Read durable capacity waits and their assignment identifiers",
		})
		.input(
			z.object({
				projectId: UlidSchema.optional(),
				before: z.string().optional(),
				state: z.enum(["waiting", "assigned", "canceled"]).optional(),
			}),
		)
		.output(z.array(managerNextAction)),
	cancelAction: base
		.route({ method: "POST", path: "/manager-actions/{id}/cancel", summary: "Cancel a pending capacity wait" })
		.input(idInput)
		.output(managerNextAction),
	list: base
		.route({ method: "GET", path: "/manager-dispatches", summary: "Read the manager queue" })
		.input(
			z.object({ projectId: UlidSchema.optional(), unhandled: z.boolean().optional(), before: z.string().optional() }),
		)
		.output(z.array(dispatch)),
	handle: base
		.route({ method: "POST", path: "/manager-dispatches/{id}/handle", summary: "Record manager coordination outcomes" })
		.input(
			z.object({
				id: z.string().min(1),
				generation: z.number().int().min(0),
				outcomes: z.array(outcome).min(1).max(100),
			}),
		)
		.output(dispatch),
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
