import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { refresh } from "../../pullRequests.ts";
import { canceled, done, mergeFixture, pullRequestRow } from "./fixture.ts";
import { mergeTickets } from "./mergeTickets.ts";

let f: Awaited<ReturnType<typeof mergeFixture>>;
beforeEach(async () => {
	f = await mergeFixture();
});
afterEach(async () => {
	await f.db.$client.close();
});
const url = "https://github.com/acme/app/pull/1";
const candidates = () => f.run((tx) => mergeTickets(f.ctx, tx, { pr: url }));

test("the last open PR offers completion for each eligible linked ticket", async () => {
	const first = await f.ticket(1);
	const second = await f.ticket(2);
	const current = await f.pr(1, "open");
	await f.link(first, current);
	await f.link(second, current);
	await f.link(first, await f.pr(2, "merged"));
	await f.link(second, await f.pr(3, "closed"));
	expect((await candidates()).map((row) => row.id)).toEqual([first, second]);
});

test("another open PR excludes only its own ticket", async () => {
	const first = await f.ticket(1);
	const second = await f.ticket(2);
	const current = await f.pr(1, "open");
	await f.link(first, current);
	await f.link(second, current);
	await f.link(first, await f.pr(2, "open"));
	expect((await candidates()).map((row) => row.id)).toEqual([second]);
});

test.each([done, canceled])("a terminal ticket has no completion choice (%s)", async (status) => {
	await f.link(await f.ticket(1, status), await f.pr(1, "open"));
	expect(await candidates()).toEqual([]);
});

test.each(["merged", "closed"] as const)("a %s PR has no completion choice", async (state) => {
	await f.link(await f.ticket(1), await f.pr(1, state));
	expect(await candidates()).toEqual([]);
});

test("an unlinked PR has no completion choice", async () => {
	await f.pr(1, "open");
	expect(await candidates()).toEqual([]);
});

test("GitHub URL casing does not change the eligible tickets", async () => {
	const ticket = await f.ticket(1);
	const pr = await f.pr(1, "open");
	await f.link(ticket, pr);
	await f.db.execute(sql`UPDATE pull_requests SET url = 'https://github.com/Acme/App/pull/1' WHERE id = ${pr}`);
	expect((await candidates()).map((row) => row.id)).toEqual([ticket]);
});

test("an archived project has no completion choice", async () => {
	await f.link(await f.ticket(1), await f.pr(1, "open"));
	await f.db.execute(sql`UPDATE projects SET archived_at = NOW() WHERE id = ${f.root}`);
	expect(await candidates()).toEqual([]);
});

test("a workflow without a Done status has no completion choice", async () => {
	await f.link(await f.ticket(1), await f.pr(1, "open"));
	await f.db.execute(sql`DELETE FROM statuses WHERE id = ${done}`);
	expect(await candidates()).toEqual([]);
});

test("changed and unchanged refreshes both preserve ticket status", async () => {
	const ticket = await f.ticket(1);
	const id = await f.pr(1, "open");
	await f.link(ticket, id);
	const row = pullRequestRow(1, "merged");
	for (let count = 0; count < 2; count++) {
		await f.run((tx) => refresh(f.ctx, tx, { id, first: { ref: { owner: "acme", repo: "app", number: 1 }, row } }));
		expect(await f.ticketState(ticket)).toEqual({ category: "review", completed: false });
		expect(await f.timelineRows(ticket)).toEqual([]);
	}
});
