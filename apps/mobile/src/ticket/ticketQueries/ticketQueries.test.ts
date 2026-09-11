import { describe, expect, test } from "bun:test";
import { isDefinedError, safe } from "@orpc/client";
import { generateOperationKey } from "@orpc/tanstack-query";
import { errors } from "@trellis/api";
import { createFakeServer } from "../../../test/fake-server";
import { approve, sendBack, ticketDetailQuery } from "./ticketQueries";

// The effective statuses of a ticket's project, through the client.
const statusesOf = async (server: ReturnType<typeof createFakeServer>, projectId: string) =>
	(await server.client.statuses.list({ project: projectId })).statuses;

describe("ticket queries", () => {
	// O15. `isDetail` in the applier matches the path, and the coalescer
	// matches the input, so the key is the one @orpc/tanstack-query builds.
	test("the ticket detail key is the oRPC operation key the event applier matches", async () => {
		const server = createFakeServer();
		const query = ticketDetailQuery(server.client, "CDE-42");
		expect(query.queryKey).toEqual(generateOperationKey(["tickets", "get"], { input: { ticket: "CDE-42" } }));
		expect((await query.queryFn()).identifier).toBe("CDE-42");
	});

	// O16.
	test("tickets.get for CDE-42 carries the description, the children, the pull request, and the attachment", async () => {
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		expect(ticket.description).toContain("## Acceptance");
		expect(ticket.children.map((child) => child.identifier)).toEqual(["CDE-48", "CDE-49", "CDE-50"]);
		expect(ticket.prs.map((pr) => pr.number)).toEqual([118]);
		expect(ticket.attachments).toHaveLength(1);
		expect(ticket.attachments[0]!.filename).toBe("fork-pages-after-merge.png");
		expect(ticket.status.name).toBe("Human Review");
		expect(ticket.status.reviewer).toBe("human");
		expect(ticket.parent?.identifier).toBe("CDE-43");
	});

	// O17.
	test("timeline.list for CDE-42 carries the four comments and the status activity", async () => {
		const server = createFakeServer();
		const page = await server.client.timeline.list({ ticket: "CDE-42" });
		expect(page.items.filter((item) => item.kind === "comment")).toHaveLength(4);
		const moves = page.items.filter((item) => item.kind === "activity" && item.field === "status");
		expect(moves.map((item) => item.kind === "activity" && item.toValue)).toEqual(["Human Review", "In Progress"]);
	});

	// O18.
	test("the approve input moves CDE-42 to Done", async () => {
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		const result = await approve(server.client, ticket, await statusesOf(server, ticket.project.id));
		expect(result.status.name).toBe("Done");
		expect(result.status.category).toBe("done");
		expect(result.version).toBeGreaterThan(ticket.version);
		expect(result.completedAt).toBeString();
		const call = server.calls.at(-1)!;
		expect(call.path).toEqual(["tickets", "update"]);
		expect((call.input as { expectedVersion: number }).expectedVersion).toBe(ticket.version);
	});

	// O19.
	test("send back posts the comment and then moves CDE-42 to In Progress", async () => {
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		const statuses = await statusesOf(server, ticket.project.id);
		const before = server.calls.length;
		const result = await sendBack(server.client, ticket, statuses, "Run the tests first");
		expect(server.calls.slice(before).map((call) => call.path.join("."))).toEqual([
			"comments.create",
			"tickets.update",
		]);
		expect(server.calls[before]!.input).toEqual({ ticket: "CDE-42", body: "Run the tests first" });
		expect(result.status.name).toBe("In Progress");
		const page = await server.client.timeline.list({ ticket: "CDE-42" });
		expect(page.items.some((item) => item.kind === "comment" && item.body === "Run the tests first")).toBe(true);
	});

	// O20.
	test("a stale expectedVersion answers VERSION_CONFLICT with the current row", async () => {
		const server = createFakeServer();
		const ticket = await server.client.tickets.get({ ticket: "CDE-42" });
		const { error } = await safe(
			server.client.tickets.update({ ticket: "CDE-42", priority: "urgent", expectedVersion: ticket.version - 1 }),
		);
		if (!isDefinedError(error) || error.code !== "VERSION_CONFLICT") throw new Error("expected VERSION_CONFLICT");
		expect(error.status).toBe(412);
		expect(error.message).toBe(errors.VERSION_CONFLICT.message);
		expect(error.data.current.identifier).toBe("CDE-42");
		expect(error.data.current.version).toBe(ticket.version);
		expect(error.data.current.priority).toBe("high");
	});
});
