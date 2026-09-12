import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { generateOperationKey } from "@orpc/tanstack-query";
import { errors } from "@trellis/api";
import { approve, sendBack, ticketDetailQuery } from "../../../../../src/ticket/ticketQueries/ticketQueries";
import { createMobileApp, type MobileApp } from "../../../../testApp";
import { seedTicketScreen, type TicketData } from "../../../../ticket";

let app: MobileApp;
let data: TicketData;

beforeAll(async () => {
	app = await createMobileApp();
});

beforeEach(async () => {
	data = await seedTicketScreen(app.seeder);
});

afterAll(() => app.close());

// The effective statuses of a ticket's project, through the client.
const statusesOf = async (projectId: string) => (await app.client.statuses.list({ project: projectId })).statuses;

describe("ticket queries", () => {
	// O15. `isDetail` in the applier matches the path, and the coalescer
	// matches the input, so the key is the one @orpc/tanstack-query builds.
	test("the ticket detail key is the oRPC operation key the event applier matches", async () => {
		const query = ticketDetailQuery(app.client, data.ticket);
		expect(query.queryKey).toEqual(generateOperationKey(["tickets", "get"], { input: { ticket: data.ticket } }));
		expect((await query.queryFn()).identifier).toBe(data.ticket);
	});

	// O16.
	test("tickets.get carries the description, the children, the pull request, and the attachment", async () => {
		const ticket = await app.client.tickets.get({ ticket: data.ticket });
		expect(ticket.description).toContain("## Acceptance");
		expect(ticket.children.map((child) => child.identifier)).toEqual(data.children);
		expect(ticket.prs.map((pr) => pr.number)).toEqual([118]);
		expect(ticket.attachments).toHaveLength(1);
		expect(ticket.attachments[0]!.filename).toBe("settings-pages.png");
		expect(ticket.status.name).toBe("Human Review");
		expect(ticket.status.reviewer).toBe("human");
		expect(ticket.parent?.identifier).toBe(data.parent);
	});

	// O17.
	test("timeline.list carries the four comments and the status activity", async () => {
		const page = await app.client.timeline.list({ ticket: data.ticket });
		expect(page.items.filter((item) => item.kind === "comment")).toHaveLength(4);
		const moves = page.items.filter((item) => item.kind === "activity" && item.field === "status");
		expect(moves.map((item) => item.kind === "activity" && item.toValue)).toEqual(["Human Review", "In Progress"]);
	});

	// O18.
	test("the approve input moves the ticket to Done", async () => {
		const ticket = await app.client.tickets.get({ ticket: data.ticket });
		const result = await approve(app.client, ticket, await statusesOf(ticket.project.id));
		expect(result.status.name).toBe("Done");
		expect(result.status.category).toBe("done");
		expect(result.version).toBeGreaterThan(ticket.version);
		expect(result.completedAt).toBeString();
		const call = app.calls.at(-1)!;
		expect(call.procedure).toBe("tickets.update");
		expect((call.input as { expectedVersion: number }).expectedVersion).toBe(ticket.version);
	});

	// O19.
	test("send back posts the comment and then moves the ticket to In Progress", async () => {
		const ticket = await app.client.tickets.get({ ticket: data.ticket });
		const statuses = await statusesOf(ticket.project.id);
		const before = app.calls.length;
		const result = await sendBack(app.client, ticket, statuses, "Run the tests first");
		expect(app.calls.slice(before).map((call) => call.procedure)).toEqual(["comments.create", "tickets.update"]);
		expect(app.calls[before]!.input).toEqual({ ticket: data.ticket, body: "Run the tests first" });
		expect(result.status.name).toBe("In Progress");
		const page = await app.client.timeline.list({ ticket: data.ticket });
		expect(page.items.some((item) => item.kind === "comment" && item.body === "Run the tests first")).toBe(true);
	});

	// O20.
	test("a stale expectedVersion answers VERSION_CONFLICT with the current row", async () => {
		const ticket = await app.client.tickets.get({ ticket: data.ticket });
		const { error } = await safe(
			app.client.tickets.update({ ticket: data.ticket, priority: "urgent", expectedVersion: ticket.version - 1 }),
		);
		if (!isDefinedError(error) || error.code !== "VERSION_CONFLICT") throw new Error("expected VERSION_CONFLICT");
		expect(error.status).toBe(412);
		expect(error.message).toBe(errors.VERSION_CONFLICT.message);
		expect(error.data.current.identifier).toBe(data.ticket);
		expect(error.data.current.version).toBe(ticket.version);
		expect(error.data.current.priority).toBe("high");
	});
});
