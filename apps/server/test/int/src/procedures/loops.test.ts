import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp();
});
afterEach(() => t.db.transaction(assertStatusInvariant));
afterAll(() => t.close());

test("the loops API exposes the live loop and human controls", async () => {
	const list = await t.api("/api/loops");
	expect(list.status).toBe(200);
	expect(list.body[0]).toMatchObject({ id: "deterministic-manager", working: false });
	const paused = await t.api("/api/loops/deterministic-manager/control", { method: "POST", body: { action: "pause" } });
	expect(paused.status).toBe(200);
	expect(paused.body.paused).toBe(true);
	const cleared = await t.api("/api/loops/deterministic-manager/control", {
		method: "POST",
		body: { action: "clear" },
	});
	expect(cleared.status).toBe(200);
	expect(cleared.body).toMatchObject({ paused: true, output: [], errors: [] });
});
test("agents cannot pause the loop that recovers them", async () => {
	const response = await t.api("/api/loops/deterministic-manager/control", {
		method: "POST",
		actor: "agent:worker",
		body: { action: "pause" },
	});
	expect(response.status).toBe(400);
	expect(response.body.message).toBe("Only a person can control loops.");
});
