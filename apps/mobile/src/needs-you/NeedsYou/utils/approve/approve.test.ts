import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { Ticket } from "@trellis/api";
import { reset, seedProject, seedTicket } from "../../../../../test/seed";
import { createMobileApp, type MobileApp } from "../../../../../test/testApp";
import { approve, sendBack } from "./approve";

let app: MobileApp;
let identifier: string;

const projectKey = "CDE";

beforeAll(async () => {
	app = await createMobileApp();
});

// One project with one ticket a human reviews, which is the row the Needs
// you screen swipes.
beforeEach(async () => {
	await reset(app.seeder);
	await seedProject(app.seeder, { key: projectKey, name: "Code" });
	const ticket = await seedTicket(app.seeder, {
		project: projectKey,
		title: "Persist the open tabs across an app restart",
		priority: "high",
		status: "human-review",
		by: "agent",
	});
	identifier = ticket.identifier;
});

afterAll(() => app.close());

const reviewRow = async () => {
	const inbox = await app.client.inbox.get({});
	return inbox.review.items.find((item) => item.identifier === identifier)!;
};

// The status of one category with the lowest position in the project.
const lowest = async (category: string) => {
	const project = await app.client.projects.get({ project: projectKey });
	return project.statuses.filter((status) => status.category === category).sort((a, b) => a.position - b.position)[0]!;
};

describe("approve", () => {
	// MI-23
	test("approve moves the ticket to the lowest-position done status", async () => {
		const summary = await reviewRow();
		expect(summary.status.slug).toBe("human-review");
		const before = app.calls.length;
		const ticket = await approve(app.client, summary);
		const moves = app.calls.slice(before).filter((call) => call.procedure === "tickets.move");
		expect(moves).toHaveLength(1);
		const input = moves[0]!.input as { ticket: string; status: string; expectedVersion?: number };
		expect([summary.id, summary.identifier]).toContain(input.ticket);
		expect(input.status).toBe("category:done");
		expect(input.expectedVersion).toBe(summary.version);
		expect(ticket.status.id).toBe((await lowest("done")).id);
		expect(ticket.version).toBe(summary.version + 1);
	});

	// MI-24
	test("send back posts the comment before the move", async () => {
		const summary = await reviewRow();
		const before = app.calls.length;
		const ticket = await sendBack(app.client, summary, "What should change");
		const written = app.calls.slice(before).map((call) => call.procedure);
		expect(written).toEqual(["comments.create", "tickets.move"]);
		expect((app.calls[before]!.input as { body: string }).body).toBe("What should change");
		expect((app.calls[before + 1]!.input as { status: string }).status).toBe("category:started");
		expect(ticket.status.id).toBe((await lowest("started")).id);
	});

	// MI-25
	test("a stale version makes approve fail with VERSION_CONFLICT", async () => {
		const summary = await reviewRow();
		const error = await approve(app.client, { ...summary, version: summary.version - 1 }).catch(
			(thrown: unknown) => thrown,
		);
		if (!(error instanceof ORPCError)) throw new Error("expected an ORPCError");
		expect(error.defined).toBe(true);
		expect(error.code).toBe("VERSION_CONFLICT");
		expect(error.status).toBe(412);
		expect((error.data as { current: Ticket }).current.version).toBe(summary.version);
		expect((await app.client.tickets.get({ ticket: identifier })).status.slug).toBe("human-review");
	});
});
