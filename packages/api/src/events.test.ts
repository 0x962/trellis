import { describe, expect, test } from "bun:test";
import { agentSession, bootId, projectId, t1, ticketSummary, ulid } from "../test/fixtures.ts";
import { EventIdSchema, EventSchema, eventNames, parseEventId } from "./events.ts";

const eventId = `${bootId}.7`;

describe("events", () => {
	test("the event name list matches the plan's Live updates section", () => {
		expect([...eventNames].sort()).toEqual([
			"agent-runs.changed",
			"agents.batch",
			"agents.session",
			"attachment.created",
			"attachment.deleted",
			"bye",
			"comment.created",
			"comment.deleted",
			"comment.updated",
			"flows.changed",
			"gh.status",
			"personas.changed",
			"pr.linked",
			"pr.unlinked",
			"pr.updated",
			"project.created",
			"project.deleted",
			"project.moved",
			"project.updated",
			"ready",
			"reset",
			"reviews.changed",
			"statuses.changed",
			"ticket.created",
			"ticket.deleted",
			"ticket.updated",
		]);
	});

	// EventSchema covers the SSE `event:` name as `type` and the `data:` body
	// as the rest. The event id travels in the SSE `id:` line, so it is not a
	// field here. `ready` carries it as `id`, because a client learns the
	// stream position from it. In `comment.*`, `attachment.*`, `pr.*`, and
	// `project.*`, `id` is the id of the resource.
	test("event payload schemas accept the plan's shapes and reject a missing or wrong field", () => {
		const events = [
			{ type: "reviews.changed", id: ulid, ticketIds: [t1], projectIds: [projectId] },
			{ type: "ticket.updated", summary: ticketSummary(), fields: ["title"], batchId: ulid },
			{ type: "pr.updated", id: ulid, ticketIds: [t1], state: "open", ciState: "pass" },
			{ type: "comment.created", id: ulid, ticketId: t1 },
			{ type: "attachment.deleted", id: ulid, ticketId: t1 },
			{ type: "statuses.changed", projectId },
			{ type: "project.updated", id: projectId },
			{ type: "gh.status", ok: false, reason: "unauthenticated" },
			{ type: "reset", reason: "restart" },
			{ type: "ready", id: eventId, bootId, serverVersion: "0.1.0", apiVersion: "1" },
			{ type: "bye", reason: "shutdown" },
		];
		for (const event of events) {
			expect(EventSchema.safeParse(event).success, event.type).toBe(true);
		}
		expect(EventSchema.safeParse({ type: "ticket.updated", fields: ["title"], batchId: ulid }).success).toBe(false);
		expect(EventSchema.safeParse({ type: "reset", reason: "other" }).success).toBe(false);
		expect(
			EventSchema.safeParse({ type: "pr.updated", id: ulid, ticketIds: [t1], state: "open", ciState: "green" }).success,
		).toBe(false);
	});

	// `agents.session` carries the whole session row, so a client patches the
	// Agents row without a read. `agents.batch` counts the events one wake
	// delivered to the manager of `projectId`.
	test("agents event payloads carry one session or a project with a positive count", () => {
		expect(EventSchema.safeParse({ type: "agents.session", session: agentSession() }).success).toBe(true);
		expect(EventSchema.safeParse({ type: "agents.session", session: agentSession({ state: "done" }) }).success).toBe(
			false,
		);
		expect(EventSchema.safeParse({ type: "agents.session" }).success).toBe(false);
		expect(EventSchema.safeParse({ type: "agents.batch", projectId, count: 10 }).success).toBe(true);
		expect(EventSchema.safeParse({ type: "agents.batch", projectId, count: 0 }).success).toBe(false);
		expect(EventSchema.safeParse({ type: "agents.batch", count: 1 }).success).toBe(false);
	});

	// The boot id is a ULID minted at server boot. A client that reconnects
	// with an id from another boot gets `reset`, so the id must round-trip
	// exactly: upper-case, one dot, a non-negative sequence.
	test("an event id is <bootId ULID>.<seq> and nothing else", () => {
		expect(EventIdSchema.safeParse(`${ulid}.42`).success).toBe(true);
		for (const input of [`${ulid.toLowerCase()}.1`, "abc.1", ulid, `${ulid}.-1`]) {
			expect(EventIdSchema.safeParse(input).success, input).toBe(false);
		}
		expect(parseEventId(`${ulid}.42`)).toEqual({ bootId: ulid, seq: 42 });
	});

	// A sequence above 2^53 loses digits in a JavaScript number, so a client
	// would resume from another position. Fifteen digits always fit.
	test("an event sequence keeps every digit up to 15 digits and rejects a longer one", () => {
		expect(parseEventId(`${ulid}.999999999999999`)).toEqual({ bootId: ulid, seq: 999999999999999 });
		for (const input of [`${ulid}.9007199254740993`, `${ulid}.${"9".repeat(309)}`]) {
			expect(EventIdSchema.safeParse(input).success, input).toBe(false);
		}
	});
});

test("comment events preserve thread identifiers and the resolution state", () => {
	const event = { type: "comment.updated", id: ulid, ticketId: t1, parentId: null, threadId: ulid, resolved: true };
	expect(EventSchema.parse(event)).toEqual(event);
});
