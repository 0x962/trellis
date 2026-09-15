import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

test("the cancellation API requires a person, a reason, and the displayed generation", async () => {
	const t = await createTestApp();
	try {
		const project = await t.seedProject("CANCEL");
		await t.editServerTx((tx) =>
			tx.execute(
				sql`INSERT INTO manager_dispatches (id,project_id,generation,state,events,due_at,error,created_at,updated_at) VALUES ('unknown-api',${project.id},2,'unknown','[]'::jsonb,now(),'original failure',now(),now())`,
			),
		);
		const path = "/api/manager-dispatches/unknown-api/cancel";
		const body = { expectedGeneration: 2, reason: "  Workspace no longer exists.  " };
		expect((await t.api(path, { method: "POST", body: { ...body, reason: " " } })).status).toBe(400);
		expect((await t.api(path, { method: "POST", body, actor: "agent:worker" })).status).toBe(400);
		expect((await t.api(path, { method: "POST", body: { ...body, expectedGeneration: 1 } })).status).toBe(400);
		const result = await t.api(path, { method: "POST", body });
		expect(result.status).toBe(200);
		expect(result.body).toMatchObject({
			state: "cancelled",
			error: "original failure",
			generation: 2,
			resolution: { receipt: "unknown", reason: "Workspace no longer exists.", actor: { kind: "human", name: "dana" } },
		});
		expect((await t.api("/api/manager-dispatches")).body[0]).toEqual(result.body);
		expect((await t.api("/api/manager-dispatches/unknown-api/retry", { method: "POST", body: {} })).status).toBe(404);
		await t.serverTx(assertStatusInvariant);
	} finally {
		await t.close();
	}
});
