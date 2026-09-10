import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type { TrellisClient } from "@trellis/api";
import { createTestApp, NAVID, type TestApp } from "../test/helpers/app.ts";

// The web app sends the calls of one tick as a single POST to /rpc/__batch__.
// The server answers that path only while the RPC handler carries the batch
// plugin, so these tests hold the two sides together.

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
	await t.seedProject("CDE");
	await t.createTicket({ project: "CDE", title: "First ticket" });
});
afterAll(() => t.close());

const batchedClient = (): TrellisClient => {
	const link = new RPCLink({
		url: "http://trellis.test/rpc",
		headers: { "x-trellis-actor": NAVID },
		fetch: (request) => Promise.resolve(t.app.request(request)),
		plugins: [new BatchLinkPlugin({ groups: [{ condition: () => true, context: {} }], mode: "buffered" })],
	});
	return createORPCClient(link);
};

describe("rpc batch", () => {
	test("two calls the web app batches come back as two results", async () => {
		const client = batchedClient();

		const [projects, tickets] = await Promise.all([client.projects.list({}), client.tickets.list({})]);

		expect(projects.map((project) => project.key)).toEqual(["CDE"]);
		expect(tickets.items.map((ticket) => ticket.identifier)).toEqual(["CDE-1"]);
	});

	test("one failing call in a batch leaves the other answered", async () => {
		const client = batchedClient();

		const [tickets, missing] = await Promise.allSettled([
			client.tickets.list({}),
			client.tickets.get({ ticket: "CDE-404" }),
		]);

		expect(tickets.status).toBe("fulfilled");
		expect(missing.status).toBe("rejected");
		if (tickets.status === "fulfilled") expect(tickets.value.items).toHaveLength(1);
		if (missing.status === "rejected") expect(missing.reason.code).toBe("NOT_FOUND");
	});
});
