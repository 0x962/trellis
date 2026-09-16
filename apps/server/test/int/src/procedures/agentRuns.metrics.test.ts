import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("ticket metrics report server-calculated age and explicit missing usage", async () => {
	t = await createTestApp();
	await t.seedProject("MET");
	const ticket = await t.createTicket({ project: "MET", title: "Measure this ticket" });
	const createdAt = new Date(Date.now() - 90_000);
	await t.editServerTx((tx) => tx.execute(sql`UPDATE tickets SET created_at=${createdAt} WHERE id=${ticket.id}`));

	const metrics = await t.client.agentRuns.ticketMetrics({ ticket: ticket.identifier });
	expect(metrics.durationMs).toBe(0);
	expect(metrics.tokenCount).toBeNull();
	expect(metrics.ageMs).toBeGreaterThanOrEqual(90_000);
	expect(metrics.ageMs).toBeLessThan(95_000);
});
