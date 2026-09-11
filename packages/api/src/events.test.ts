import { describe, expect, test } from "bun:test";
import { attachmentEvent, bootId, commentEvent, prEvent, projectId, ticketSummary, ulid } from "../test/fixtures.ts";
import { EVENT_BODY_LIMIT, EventIdSchema, EventSchema, eventNames, parseEventId } from "./events.ts";

const eventId = `${bootId}.7`;

describe("events", () => {
	test("the event name list matches the plan's Live updates section", () => {
		expect([...eventNames].sort()).toEqual([
			"agent-runs.changed",
			"attachment.created",
			"attachment.deleted",
			"bye",
			"comment.created",
			"comment.deleted",
			"comment.updated",
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
			{ type: "ticket.updated", summary: ticketSummary(), fields: ["title"], batchId: ulid },
			prEvent("pr.updated"),
			commentEvent("comment.created"),
			attachmentEvent("attachment.deleted"),
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
		expect(EventSchema.safeParse(prEvent("pr.updated", { ciState: "green" })).success).toBe(false);
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
	const event = commentEvent("comment.updated", { parentId: null, threadId: ulid, resolved: true });
	expect(EventSchema.parse(event)).toEqual(event);
});

// TRL-9. A reader of the event stream acts on the event it reads. Every event
// about a comment, an attachment, or a pull request carries the content of
// that row, so the reader needs no second call. An event without the content
// is not an event.
describe("content", () => {
	test("a comment event names the ticket, the author, and the text", () => {
		const event = commentEvent("comment.created");
		expect(EventSchema.parse(event)).toEqual(event);
		for (const field of ["ticketIdentifier", "ticketTitle", "actor", "body", "bodyTruncated"]) {
			const { [field]: _dropped, ...without } = event as Record<string, unknown>;
			expect(EventSchema.safeParse(without).success, field).toBe(false);
		}
	});

	// A comment body holds up to 200000 characters, and the bus keeps the
	// last 1000 events in memory. The event carries the first 2000 characters
	// and sets `bodyTruncated`, which tells the reader to read the comment
	// itself for the rest.
	test("a comment event stops at the body limit", () => {
		expect(EVENT_BODY_LIMIT).toBe(2000);
		expect(EventSchema.safeParse(commentEvent("comment.created", { body: "x".repeat(2000) })).success).toBe(true);
		expect(EventSchema.safeParse(commentEvent("comment.created", { body: "x".repeat(2001) })).success).toBe(false);
	});

	test("an attachment event names the ticket, the author, and the file", () => {
		const event = attachmentEvent("attachment.created");
		expect(EventSchema.parse(event)).toEqual(event);
		for (const field of ["ticketIdentifier", "ticketTitle", "actor", "filename"]) {
			const { [field]: _dropped, ...without } = event as Record<string, unknown>;
			expect(EventSchema.safeParse(without).success, field).toBe(false);
		}
	});

	test("a pull request event names the repository, the number, the URL, the title, and its tickets", () => {
		const event = prEvent("pr.linked");
		expect(EventSchema.parse(event)).toEqual(event);
		for (const field of ["owner", "repo", "number", "url", "title", "ticketIdentifiers"]) {
			const { [field]: _dropped, ...without } = event as Record<string, unknown>;
			expect(EventSchema.safeParse(without).success, field).toBe(false);
		}
	});
});
