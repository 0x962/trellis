import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import { createTrellisClient } from "@trellis/api";
import { createTestApp, DANA, type TestApp } from "../../test/helpers/app.ts";

// Every procedure response carries
// `Server-Timing: db;dur=<ms>`, the time the database spent on the request.
// The perf suite reads its p95 from this header.

const DB_DURATION = /^db;dur=(\d+(?:\.\d+)?)$/;

const dbDurationOf = (headers: Headers) => {
	const header = headers.get("server-timing");
	expect(header).toMatch(DB_DURATION);
	return Number(DB_DURATION.exec(header!)![1]);
};

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
	await t.seedProject("TIM", "Timing");
});
afterAll(() => t.close());

describe("Server-Timing", () => {
	test("a GET under /api carries the db duration", async () => {
		const response = await t.api("/api/tickets?project=TIM");

		expect(response.status).toBe(200);
		expect(dbDurationOf(response.headers)).toBeGreaterThan(0);
	});

	test("a mutation under /api carries the db duration", async () => {
		const response = await t.api("/api/tickets", { method: "POST", body: { project: "TIM", title: "Timed" } });

		expect(response.status).toBe(201);
		expect(dbDurationOf(response.headers)).toBeGreaterThan(0);
	});

	test("an error answer under /api carries the db duration", async () => {
		const response = await t.api("/api/tickets/TIM-999");

		expect(response.status).toBe(404);
		expect(dbDurationOf(response.headers)).toBeGreaterThan(0);
	});

	test("a call under /rpc carries the db duration", async () => {
		const response = await t.app.request("http://trellis.test/rpc/tickets/counts", {
			method: "POST",
			headers: { "content-type": "application/json", "x-trellis-actor": DANA },
			body: JSON.stringify({ json: { project: "TIM" } }),
		});

		expect(response.status).toBe(200);
		expect(dbDurationOf(response.headers)).toBeGreaterThan(0);
	});

	test("a buffered batch under /rpc carries the db duration of all its calls", async () => {
		const seen: Headers[] = [];
		const client = createTrellisClient(
			"http://trellis.test",
			DANA,
			async (request) => {
				const response = await t.app.request(request);
				seen.push(response.headers);
				return response;
			},
			{ plugins: [new BatchLinkPlugin({ groups: [{ condition: () => true, context: {} }], mode: "buffered" })] },
		);

		await Promise.all([client.tickets.counts({ project: "TIM" }), client.tickets.list({ project: "TIM" })]);

		expect(seen).toHaveLength(1);
		expect(dbDurationOf(seen[0]!)).toBeGreaterThan(0);
	});

	test("the db duration is never longer than the request", async () => {
		const started = performance.now();
		const response = await t.api("/api/tickets?project=TIM&limit=200");
		const elapsed = performance.now() - started;

		expect(dbDurationOf(response.headers)).toBeLessThanOrEqual(elapsed);
	});
});
