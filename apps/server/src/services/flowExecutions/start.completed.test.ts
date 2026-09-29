import { afterAll, beforeAll, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createCache } from "../../db/cache.ts";
import { reserve } from "../agentRuns/reserve.ts";
import { resolveTicket } from "../refs.ts";
import { create as createStatus } from "../statuses.ts";
import { move } from "../tickets/move.ts";
import { claimNext } from "./claimNext.ts";
import { start } from "./start.ts";
import { testFixture } from "./testFixture";

let f: Awaited<ReturnType<typeof testFixture>>;

beforeAll(async () => {
	f = await testFixture();
	for (const category of ["done", "canceled"] as const) {
		await f.run((tx) => createStatus(f.ctx, tx, { project: "ONE", name: category, category }));
	}
}, 30_000);

afterAll(async () => f.db.$client.close());

async function completed(category = "done", state = "merged") {
	const { input } = await f.createExecution();
	await f.db.execute(sql`UPDATE pull_requests SET state=${state} WHERE id=${input.diffId}`);
	await f.run((tx) => move(f.ctx, tx, { ticket: input.ticket, status: category }));
	return { ...input, requestId: crypto.randomUUID() };
}

test("a Done ticket accepts its merged diff and reserves its flow worker", async () => {
	const input = await completed();
	const before = await f.run((tx) => resolveTicket(f.ctx, tx, input.ticket));
	const execution = await f.run((tx) => start(f.ctx, tx, input));
	expect(execution.diffId).toBe(input.diffId);
	const worker = await f.run((tx) => claimNext(f.ctx, tx, { id: execution.id }));
	expect(worker?.run.kind).toBe("flow");
	expect(worker?.run.ticketId).toBe(input.ticket);
	expect(await f.run((tx) => resolveTicket(f.ctx, tx, input.ticket))).toEqual(before);
	await expect(f.run((tx) => reserve(f.ctx, tx, { ticket: input.ticket }))).rejects.toThrow(
		"Reopen the ticket before an agent starts.",
	);
});

test("a Done ticket infers its sole merged diff", async () => {
	const input = await completed();
	const { diffId, ...implicit } = input;
	expect((await f.run((tx) => start(f.ctx, tx, implicit))).diffId).toBe(diffId);
});

for (const [category, state] of [
	["done", "open"],
	["done", "closed"],
	["canceled", "merged"],
]) {
	test(`${category} rejects a new flow for a ${state} diff`, async () => {
		const input = await completed(category, state);
		await expect(f.run((tx) => start(f.ctx, tx, input))).rejects.toThrow("Reopen the ticket");
	});
}

test("a Done ticket rejects absent, unlinked and missing diffs", async () => {
	const input = await completed();
	await expect(f.run((tx) => start(f.ctx, tx, { ...input, diffId: ulid() }))).rejects.toThrow("must link");
	await f.db.execute(sql`DELETE FROM ticket_pull_requests WHERE ticket_id=${input.ticket}`);
	await expect(f.run((tx) => start(f.ctx, tx, input))).rejects.toThrow("must link");
	const { diffId: _diffId, ...withoutDiff } = input;
	await expect(f.run((tx) => start(f.ctx, tx, withoutDiff))).rejects.toThrow("Reopen the ticket");
});

test("a Done ticket requires a selected merged diff when it has several links", async () => {
	const input = await completed();
	const other = await completed("done", "open");
	await f.db.execute(sql`INSERT INTO ticket_pull_requests
		(ticket_id,pull_request_id,source,actor_name,actor_kind,created_at)
		VALUES (${input.ticket},${other.diffId},'manual','Test','agent',${f.ctx.now})`);
	const { diffId: _diffId, ...ambiguous } = input;
	await expect(f.run((tx) => start(f.ctx, tx, ambiguous))).rejects.toThrow("Reopen the ticket");
	await expect(f.run((tx) => start(f.ctx, tx, { ...input, diffId: other.diffId }))).rejects.toThrow(
		"Reopen the ticket",
	);
	expect((await f.run((tx) => start(f.ctx, tx, input))).diffId).toBe(input.diffId);
});

test("a merged review preserves replay, reuse, automatic retry and explicit repeat", async () => {
	const input = await completed();
	const first = await f.run((tx) => start(f.ctx, tx, input));
	expect((await f.run((tx) => start(f.ctx, tx, { ...input, requestId: crypto.randomUUID() }))).id).toBe(first.id);
	await f.db.execute(
		sql`UPDATE flow_executions SET state=${JSON.stringify({ ...first.state, status: "failed", failureKind: "error" })}::jsonb WHERE id=${first.id}`,
	);
	const retry = await f.run((tx) => start(f.ctx, tx, { ...input, requestId: crypto.randomUUID() }));
	expect(retry.repeatOf).toBe(first.id);
	expect((await f.run((tx) => claimNext(f.ctx, tx, { id: retry.id })))?.run.kind).toBe("flow");
	const repeatedInput = {
		...input,
		requestId: crypto.randomUUID(),
		allowRepeat: true,
		repeatReason: "The user requests another review.",
	};
	const repeated = await f.run((tx) => start(f.ctx, tx, repeatedInput));
	expect(repeated.repeatOf).toBe(retry.id);
	expect(repeated.repeatReason).toBe(repeatedInput.repeatReason);
	await f.run((tx) => move(f.ctx, tx, { ticket: input.ticket, status: "canceled" }));
	await f.db.execute(sql`DELETE FROM ticket_pull_requests WHERE ticket_id=${input.ticket}`);
	expect((await f.run((tx) => start(f.ctx, tx, repeatedInput))).id).toBe(repeated.id);
	await expect(f.run((tx) => start(f.ctx, tx, { ...repeatedInput, repeatReason: "Changed reason" }))).rejects.toThrow(
		"different flow start",
	);
});

test("a Done ticket keeps the repeat validation", async () => {
	const input = await completed();
	await expect(f.run((tx) => start(f.ctx, tx, { ...input, allowRepeat: true }))).rejects.toThrow("reason");
	await expect(f.run((tx) => start(f.ctx, tx, { ...input, repeatReason: "Not authorized" }))).rejects.toThrow(
		"allowRepeat",
	);
});

test("a merged review still rejects an archived project", async () => {
	const input = await completed();
	await expect(
		f.run(async (tx) => {
			await tx.execute(sql`UPDATE projects SET archived_at=${f.ctx.now} WHERE key='ONE'`);
			const ctx = { ...f.ctx, cache: createCache() };
			await ctx.cache.rebuild(tx);
			return start(ctx, tx, input);
		}),
	).rejects.toThrow("archived");
});
