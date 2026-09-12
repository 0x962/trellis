import { afterAll, beforeAll, expect, test } from "bun:test";
import { selectCandidates } from "../../../../src/gh/pollerDue";
import { createTestApp, type TestApp } from "../../../helpers/app";
import { assertStatusInvariant } from "../../../invariants";

let t: TestApp;
beforeAll(async () => {
	t = await createTestApp({
		gh: Object.assign(async () => ({ ok: false as const, reason: "missing" as const, message: "offline" }), {
			bin: "missing",
			timeoutMs: 100,
		}),
	});
});
afterAll(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});
test("keeps review history after unlink, ticket deletion, and project deletion", async () => {
	const ids = [];
	for (const [index, action] of ["unlink", "ticket", "project"].entries()) {
		const project = await t.seedProject(["UNL", "DEL", "PRJ"][index]);
		const ticket = await t.createTicket({ project: project.id, title: "Review retention" });
		const url = `https://github.com/owner/repo/pull/${100 + index}`;
		const thread = await t.client.reviews.add({ pr: url, path: "a.ts", line: 1, body: "Preserve me." });
		ids.push(thread.prId);
		await t.client.pullRequests.link({ ticket: ticket.id, url });
		if (action === "unlink") await t.client.pullRequests.unlink({ ticket: ticket.id, id: thread.prId });
		else if (action === "ticket") await t.client.tickets.delete({ ticket: ticket.id });
		else await t.client.projects.delete({ project: project.id, force: true });
		expect((await t.client.reviews.thread({ id: thread.id })).body).toBe("Preserve me.");
		expect((await t.client.reviews.export({ pr: url })).threads).toHaveLength(1);
	}
	const candidates = await t.serverTx((tx) => selectCandidates(tx, new Date()));
	for (const id of ids) expect(candidates.map((p) => p.id)).toContain(id);
});
