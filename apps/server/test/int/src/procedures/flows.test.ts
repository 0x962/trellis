import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterAll(() => t.close());

const step = (title: string) => ({
	id: ulid(),
	parentId: null,
	kind: "agent",
	title,
	personaId: null,
	instruction: `Do ${title}.`,
	minutes: null,
	maxRounds: null,
	x: 0,
	y: 0,
	width: null,
	height: null,
});

describe("flows procedures", () => {
	test("REST creates a flow with a Location, PUT saves its graph, and RPC reads the same graph", async () => {
		const created = await t.api("/api/flows", { method: "POST", body: { name: "  Review  " } });
		expect(created.status).toBe(201);
		expect(created.body).toMatchObject({ name: "Review", slug: "review", version: 1 });
		expect(created.headers.get("location")).toBe("/api/flows/review");
		const a = step("A");
		const b = step("B");
		const saved = await t.api("/api/flows/review/graph", {
			method: "PUT",
			body: {
				nodes: [a, b],
				edges: [{ id: ulid(), fromNodeId: a.id, toNodeId: b.id, branch: "out" }],
				expectedVersion: 1,
			},
		});
		expect(saved.status).toBe(200);
		expect(saved.body.flow.version).toBe(2);
		expect(await t.client.flows.get({ flow: created.body.id })).toEqual(saved.body);
		expect(await t.client.flows.list({})).toMatchObject([{ slug: "review", nodeCount: 2, edgeCount: 1 }]);
	});

	test("a stale version answers 412 with the current version", async () => {
		const flow = await t.client.flows.create({ name: "Stale" });
		await t.client.flows.update({ flow: flow.slug, briefing: "Read the target." });
		const response = await t.api(`/api/flows/${flow.slug}/graph`, {
			method: "PUT",
			body: { nodes: [], edges: [], expectedVersion: 1 },
		});
		expect(response.status).toBe(412);
		expect(response.body).toMatchObject({ code: "FLOW_VERSION_CONFLICT", data: { version: 2 } });
	});

	test("a budget without minutes fails the input schema", async () => {
		const flow = await t.client.flows.create({ name: "Budget" });
		const response = await t.api(`/api/flows/${flow.slug}/graph`, {
			method: "PUT",
			body: { nodes: [{ ...step("Box"), kind: "budget" }], edges: [] },
		});
		expect(response.status).toBe(400);
		expect(response.body.code).toBe("INPUT_VALIDATION_FAILED");
	});

	test("every mutation requires an actor", async () => {
		for (const [method, path] of [
			["POST", "/api/flows"],
			["PATCH", "/api/flows/review"],
			["PUT", "/api/flows/review/graph"],
			["DELETE", "/api/flows/review"],
		]) {
			const response = await t.api(path!, { method, actor: null, body: { name: "Review" } });
			expect(response.status, `${method} ${path}`).toBe(400);
			expect(response.body.code).toBe("ACTOR_REQUIRED");
		}
	});
});
