import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { Ticket } from "@trellis/api";
import { callsTo, createFakeServer } from "../../../../../test/fakeServer";
import { approve, sendBack } from "./approve";

const reviewRow = async (server: ReturnType<typeof createFakeServer>, identifier: string) => {
	const inbox = await server.client.inbox.get({});
	return inbox.review.items.find((item) => item.identifier === identifier)!;
};

// The status of one category with the lowest position in the CDE project.
const lowest = async (server: ReturnType<typeof createFakeServer>, category: string) => {
	const project = await server.client.projects.get({ project: "CDE" });
	return project.statuses.filter((status) => status.category === category).sort((a, b) => a.position - b.position)[0]!;
};

describe("approve", () => {
	// MI-23
	test("approve moves the ticket to the lowest-position done status", async () => {
		const server = createFakeServer();
		const summary = await reviewRow(server, "CDE-42");
		expect(summary.status.slug).toBe("human-review");
		const ticket = await approve(server.client, summary);
		const moves = callsTo(server, "tickets.move");
		expect(moves).toHaveLength(1);
		const input = moves[0]!.input as { ticket: string; status: string; expectedVersion?: number };
		expect([summary.id, summary.identifier]).toContain(input.ticket);
		expect(input.status).toBe("category:done");
		expect(input.expectedVersion).toBe(summary.version);
		expect(ticket.status.id).toBe((await lowest(server, "done")).id);
		expect(ticket.version).toBe(summary.version + 1);
	});

	// MI-24
	test("send back posts the comment before the move", async () => {
		const server = createFakeServer();
		const summary = await reviewRow(server, "CDE-42");
		const ticket = await sendBack(server.client, summary, "What should change");
		const comments = callsTo(server, "comments.create");
		const moves = callsTo(server, "tickets.move");
		expect(comments).toHaveLength(1);
		expect(moves).toHaveLength(1);
		expect(server.calls.indexOf(comments[0]!)).toBeLessThan(server.calls.indexOf(moves[0]!));
		expect((comments[0]!.input as { body: string }).body).toBe("What should change");
		expect((moves[0]!.input as { status: string }).status).toBe("category:started");
		expect(ticket.status.id).toBe((await lowest(server, "started")).id);
	});

	// MI-25
	test("a stale version makes approve fail with VERSION_CONFLICT", async () => {
		const server = createFakeServer();
		const summary = await reviewRow(server, "CDE-42");
		const error = await approve(server.client, { ...summary, version: summary.version - 1 }).catch(
			(thrown: unknown) => thrown,
		);
		if (!(error instanceof ORPCError)) throw new Error("expected an ORPCError");
		expect(error.defined).toBe(true);
		expect(error.code).toBe("VERSION_CONFLICT");
		expect(error.status).toBe(412);
		expect((error.data as { current: Ticket }).current.version).toBe(summary.version);
		expect((await server.client.tickets.get({ ticket: "CDE-42" })).status.slug).toBe("human-review");
	});
});
