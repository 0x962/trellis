import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import type { GhRunner } from "../../../gh/run.ts";
import { type Action, action, actionResult } from "../remote.ts";
import { canceled, mergeFixture, pullRequestRow, review } from "./fixture.ts";

let f: Awaited<ReturnType<typeof mergeFixture>>;
beforeEach(async () => {
	f = await mergeFixture();
});
afterEach(async () => {
	await f.db.$client.close();
});
const url = "https://github.com/acme/app/pull/1";
const selected = (id: string) => ({ id, statusId: review });
const prepare = (name: Action, completeTicketIds: string[], gh: GhRunner) =>
	action({ ...f.ctx, gh }, { pr: url, action: name, headSha: "abc1234", completeTicketIds });

test("the explicit choice survives GitHub preparation and completes in the result transaction", async () => {
	const ticket = await f.ticket(1);
	await f.link(ticket, await f.pr(1, "open"));
	const responses = [
		{ id: "PR1", headRefOid: "abc1234", isDraft: false },
		null,
		{
			data: {
				pr0: {
					pullRequest: {
						number: 1,
						additions: 1,
						deletions: 0,
						changedFiles: 0,
						files: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 },
						title: "Merge the ticket",
						state: "MERGED",
						isDraft: false,
						mergeQueueEntry: null,
						url,
						headRefOid: "abc1234",
						baseRefOid: "base",
						headRefName: "feature",
						baseRefName: "main",
						mergeable: "MERGEABLE",
						mergedAt: "2026-09-30T07:00:00Z",
						closedAt: null,
						reviewDecision: null,
						commits: { nodes: [] },
					},
				},
			},
		},
	];
	const calls: string[][] = [];
	const gh: GhRunner = Object.assign(
		async (_slot: unknown, args: string[]) => {
			calls.push(args);
			return { ok: true as const, code: 0 as const, stdout: JSON.stringify(responses.shift()), stderr: "" };
		},
		{ bin: "gh", timeoutMs: undefined },
	);
	const prepared = await prepare("merge", [ticket], gh);
	expect(prepared.completeTickets).toContainEqual(expect.objectContaining(selected(ticket)));
	expect(await f.ticketState(ticket)).toEqual({ category: "review", completed: false });
	const result = await f.run((tx) => actionResult(f.ctx, tx, prepared));
	expect(result.completedTicketIds).toEqual([ticket]);
	expect(calls[1]).toEqual(["pr", "merge", url, "--squash", "--match-head-commit", "abc1234"]);
});

test.each(["merge", "admin-merge"] as const)("%s alone preserves ticket status", async (name) => {
	const ticket = await f.ticket(1);
	await f.link(ticket, await f.pr(1, "open"));
	const result = await f.run((tx) =>
		actionResult(f.ctx, tx, { action: name, row: pullRequestRow(1, "merged"), completeTickets: [] }),
	);
	expect(result.state).toBe("merged");
	expect(result.completedTicketIds).toEqual([]);
	expect(await f.ticketState(ticket)).toEqual({ category: "review", completed: false });
});

test.each(["merge", "admin-merge"] as const)(
	"%s completes only the selected linked tickets as the caller",
	async (name) => {
		const ticket = await f.ticket(1);
		const other = await f.ticket(2);
		const pr = await f.pr(1, "open");
		await f.link(ticket, pr);
		await f.link(other, pr);
		const result = await f.run((tx) =>
			actionResult(f.ctx, tx, { action: name, row: pullRequestRow(1, "merged"), completeTickets: [selected(ticket)] }),
		);
		expect(result.completedTicketIds).toEqual([ticket]);
		expect(await f.ticketState(ticket)).toEqual({ category: "done", completed: true });
		expect(await f.ticketState(other)).toEqual({ category: "review", completed: false });
		expect(await f.timelineRows(ticket)).toContainEqual({
			actorName: "dana",
			actorKind: "human",
			action: "ticket.updated",
			field: "status",
			toValue: "Done",
		});
	},
);

test("an accepted merge that remains open does not complete the ticket", async () => {
	const ticket = await f.ticket(1);
	await f.link(ticket, await f.pr(1, "open"));
	const result = await f.run((tx) =>
		actionResult(f.ctx, tx, {
			action: "merge",
			row: { ...pullRequestRow(1, "open"), isQueued: true },
			completeTickets: [selected(ticket)],
		}),
	);
	expect(result.completedTicketIds).toEqual([]);
	expect(await f.ticketState(ticket)).toEqual({ category: "review", completed: false });
});

test.each(["link", "unlink", "status", "cancel", "archive"] as const)(
	"a concurrent %s change prevents completion",
	async (change) => {
		const ticket = await f.ticket(1);
		const pr = await f.pr(1, "open");
		await f.link(ticket, pr);
		if (change === "link") await f.link(ticket, await f.pr(2, "open"));
		if (change === "unlink") await f.db.execute(sql`DELETE FROM ticket_pull_requests WHERE ticket_id = ${ticket}`);
		if (change === "status")
			await f.db.execute(sql`UPDATE tickets SET status_id = (
			SELECT id FROM statuses WHERE project_id = ${f.root} AND category = 'todo'
		) WHERE id = ${ticket}`);
		if (change === "cancel") await f.db.execute(sql`UPDATE tickets SET status_id = ${canceled} WHERE id = ${ticket}`);
		if (change === "archive") await f.db.execute(sql`UPDATE projects SET archived_at = NOW() WHERE id = ${f.root}`);
		const result = await f.run((tx) =>
			actionResult(f.ctx, tx, {
				action: "merge",
				row: pullRequestRow(1, "merged"),
				completeTickets: [selected(ticket)],
			}),
		);
		expect(result.state).toBe("merged");
		expect(result.completedTicketIds).toEqual([]);
		expect((await f.ticketState(ticket)).category).toBe(
			change === "status" ? "todo" : change === "cancel" ? "canceled" : "review",
		);
	},
);

test("completion cannot target an unrelated ticket or one with another open PR", async () => {
	const ticket = await f.ticket(1);
	let calls = 0;
	const gh = Object.assign(
		async () => {
			calls++;
			throw new Error("Unexpected GitHub call");
		},
		{ bin: "gh", timeoutMs: undefined },
	);
	await f.pr(1, "open");
	await expect(prepare("merge", [ticket], gh)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	const [pr] = (await f.db.execute(sql`SELECT id FROM pull_requests WHERE url = ${url}`)).rows;
	await f.link(ticket, String(pr!.id));
	await f.link(ticket, await f.pr(2, "open"));
	await expect(prepare("merge", [ticket], gh)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(calls).toBe(0);
});

test.each(["automerge", "queue", "close"] as const)("%s refuses ticket completion before GitHub", async (name) => {
	let calls = 0;
	const gh = Object.assign(
		async () => {
			calls++;
			throw new Error("Unexpected GitHub call");
		},
		{ bin: "gh", timeoutMs: undefined },
	);
	await expect(prepare(name, [await f.ticket(1)], gh)).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	expect(calls).toBe(0);
});

test("a failed explicit merge leaves the selected ticket open", async () => {
	const ticket = await f.ticket(1);
	await f.link(ticket, await f.pr(1, "open"));
	let calls = 0;
	const gh: GhRunner = Object.assign(
		async () => {
			calls++;
			return calls === 1
				? {
						ok: true as const,
						code: 0 as const,
						stdout: JSON.stringify({ id: "PR1", headRefOid: "abc1234", isDraft: false }),
						stderr: "",
					}
				: { ok: false as const, reason: "error" as const, code: 1, stdout: "", message: "Merge refused" };
		},
		{ bin: "gh", timeoutMs: undefined },
	);
	await expect(prepare("merge", [ticket], gh)).rejects.toMatchObject({ code: "GH_UNAVAILABLE" });
	expect(calls).toBe(2);
	expect(await f.ticketState(ticket)).toEqual({ category: "review", completed: false });
	expect(await f.timelineRows(ticket)).toEqual([]);
});
