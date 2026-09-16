import type { ErrorMap } from "@orpc/contract";
import { z } from "zod";
import { actorHeaderGrammar } from "./refs.ts";
import { GhReasonSchema, RunnerReasonSchema } from "./schemas/enums.ts";
import { CountSchema } from "./schemas/primitives.ts";
import { StatusSummarySchema } from "./schemas/status.ts";
import { TicketSchema } from "./schemas/ticket.ts";

// One Standard Schema issue. Extra keys (zod's `code`, `expected`) pass through.
const IssueSchema = z.looseObject({
	message: z.string(),
	path: z.array(z.union([z.string(), z.number()])).optional(),
});

// Every error the API declares: `status` is the HTTP status, `message` the
// default text, `data` the payload a client reads to recover. The server
// throws these through the contract and every client narrows on `code`.
// An error without a payload declares `z.undefined()`, so `data` is typed
// as absent instead of as an empty object.
export const errors = {
	RESTART_FAILED: {
		status: 503,
		message: "An agent session could not resume after the system restart.",
		data: z.object({
			restartId: z.string().min(1),
			runId: z.string().min(1),
			attemptId: z.string().min(1),
			requestId: z.string().min(1),
		}),
	},
	REVIEW_VERSION_CONFLICT: {
		status: 412,
		message: "The review message changed. Read it again before an edit.",
		data: z.undefined(),
	},
	INPUT_VALIDATION_FAILED: {
		status: 400,
		message: "The input does not match the schema.",
		data: z.object({ issues: z.array(IssueSchema) }),
	},
	ACTOR_REQUIRED: {
		status: 400,
		message: 'Set header x-trellis-actor, e.g. "x-trellis-actor: agent:claude-code".',
		data: z.undefined(),
	},
	ACTOR_INVALID: {
		status: 400,
		message: actorHeaderGrammar,
		data: z.object({ grammar: z.string() }),
	},
	INVALID_CURSOR: {
		status: 400,
		message: "The cursor belongs to another filter or sort. Start the list again without it.",
		data: z.undefined(),
	},
	INVALID_PR_URL: {
		status: 400,
		message: "The URL is not a GitHub pull request URL.",
		data: z.undefined(),
	},
	AGENT_CANNOT_DELETE: {
		status: 403,
		message: "An agent cannot delete a ticket or a project without force.",
		data: z.undefined(),
	},
	NOT_FOUND: {
		status: 404,
		message: "No row matches the ref.",
		data: z.object({ kind: z.string().min(1), ref: z.string() }),
	},
	DUPLICATE: {
		status: 409,
		message: "A row with this value exists.",
		data: z.object({ field: z.string().min(1) }),
	},
	KEY_LOCKED: {
		status: 409,
		message: "The key is immutable after the first ticket is numbered.",
		data: z.undefined(),
	},
	STATUS_NOT_IN_PROJECT: {
		status: 409,
		message: "The status is not in the ticket's effective status set.",
		data: z.object({ valid: z.array(StatusSummarySchema) }),
	},
	STATUS_IN_USE: {
		status: 409,
		message: "Tickets use this status. Pass moveTo to move them first.",
		data: z.object({ count: CountSchema }),
	},
	LAST_STATUS: {
		status: 409,
		message: "A project keeps at least one status.",
		data: z.undefined(),
	},
	ROOT_STATUSES: {
		status: 409,
		message: "A root project owns its statuses and cannot clear them.",
		data: z.undefined(),
	},
	STATUS_CATEGORY_IMMUTABLE: {
		status: 409,
		message: "The category of a status is immutable.",
		data: z.undefined(),
	},
	CROSS_ROOT_MOVE: {
		status: 409,
		message: "A ticket, a parent, or a project cannot move to another root.",
		data: z.undefined(),
	},
	PARENT_CYCLE: {
		status: 409,
		message: "A ticket or a project cannot be its own ancestor.",
		data: z.undefined(),
	},
	PROJECT_NOT_EMPTY: {
		status: 409,
		message: "The project holds tickets or sub-projects. Pass force to delete them too.",
		data: z.object({ tickets: CountSchema, projects: CountSchema }),
	},
	PROJECT_ARCHIVED: {
		status: 409,
		message: "The project is archived. Unarchive it before a change.",
		data: z.undefined(),
	},
	COMMENT_PARENT_MISMATCH: {
		status: 409,
		message: "The parent comment belongs to another ticket.",
		data: z.undefined(),
	},
	CHAT_AI_ONLY: {
		status: 403,
		message: "This channel is for agents only. A person reads it and does not post in it.",
		data: z.undefined(),
	},
	COMMENT_HAS_REPLIES: {
		status: 409,
		message: "This comment has replies. Delete its replies before you delete the comment.",
		data: z.undefined(),
	},
	INVALID_ANCHOR: {
		status: 409,
		message: "The after or before ticket is not in the target column.",
		data: z.undefined(),
	},
	CONCURRENCY_LIMIT: {
		status: 409,
		message: "The project runs its maximum number of builders. Start this one when a builder finishes.",
		data: z.object({ limit: z.number().int().positive(), running: CountSchema }),
	},
	VERSION_CONFLICT: {
		status: 412,
		message: "The ticket changed since the version you sent.",
		data: z.object({ current: TicketSchema }),
	},
	// `version` is the current version of the flow. The client reads the flow
	// again and repeats the change on top of it.
	FLOW_VERSION_CONFLICT: {
		status: 412,
		message: "The flow changed since the version you sent. Read the flow again before you save.",
		data: z.object({ version: z.number().int().positive() }),
	},
	PAYLOAD_TOO_LARGE: {
		status: 413,
		message: "The upload is over the size limit.",
		data: z.object({ maxBytes: CountSchema }),
	},
	GH_UNAVAILABLE: {
		status: 503,
		message: "gh cannot serve the request.",
		data: z.object({ reason: GhReasonSchema }),
	},
	RUNNER_UNAVAILABLE: {
		status: 503,
		message: "The agent runner cannot serve the request.",
		data: z.object({ reason: RunnerReasonSchema }),
	},
} satisfies ErrorMap;

export type ErrorCode = keyof typeof errors;

// A subset of the map, for a procedure that declares only the codes it throws.
export const pickErrors = <const C extends readonly ErrorCode[]>(codes: C) =>
	Object.fromEntries(codes.map((code) => [code, errors[code]])) as Pick<typeof errors, C[number]>;
