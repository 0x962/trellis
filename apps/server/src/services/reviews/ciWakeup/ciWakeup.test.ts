import { afterEach, beforeEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getRun } from "../../agentRuns/queries.ts";
import { waitingForRun } from "../../deliveries/sentences.ts";
import { prepare } from "../runDeliveries.ts";
import { fixture } from "./fixture.ts";

let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {
	f = await fixture();
}, 30_000);
afterEach(async () => f.close());

test.each(["failed", "passed", "stuck", "queued", "dequeued", "merged"] as const)(
	"a %s notice resumes the saved conversation once",
	async (kind) => {
		const queued = await f.queue(kind);
		let reads = 0;
		await prepare(
			f.ctx,
			{},
			async (home, input) => {
				reads++;
				expect(home).toBe(f.ctx.home);
				expect(input).toEqual({ ids: [f.terminalId] });
				return { sessions: [f.saved], complete: true };
			},
			f.dispatch,
		);

		expect(reads).toBe(1);
		expect(f.prompts).toHaveLength(1);
		expect(f.prompts[0]).toContain(queued.url);
		expect(f.prompts[0]).not.toContain("Original task");
		expect(f.messages).toEqual([]);
		expect(await f.delivery(queued.deliveryId)).toEqual({ state: "sent", error: null });
		const run = await f.ctx.newTx((tx) => getRun(tx, f.id));
		expect(run.terminalId).not.toBe(f.terminalId);
		expect(run.sessionId).toBe(f.sessionId);
		expect(run.workspaceId).toBe(f.workspace);
		expect(run.closedAt).toBeNull();
		await f.dispatch(f.ctx, [f.current()]);
		expect(f.prompts).toHaveLength(1);
		expect(f.messages).toEqual([]);
	},
);

test("a held CI notice wakes an idle-expired agent", async () => {
	const queued = await f.queue();
	await f.db.execute(
		sql`UPDATE review_deliveries SET state='held',error=${waitingForRun} WHERE id=${queued.deliveryId}`,
	);
	await f.dispatch(f.ctx, [f.saved]);
	expect(f.prompts).toHaveLength(1);
	expect(await f.delivery(queued.deliveryId)).toEqual({ state: "sent", error: null });
});

test("another CI notice waits for the new attempt before delivery", async () => {
	const first = await f.queue();
	const second = await f.queue();
	await f.dispatch(f.ctx, [f.saved]);
	expect(f.prompts).toHaveLength(1);
	expect(f.messages).toEqual([]);
	const deliveries = [await f.delivery(first.deliveryId), await f.delivery(second.deliveryId)];
	expect(deliveries.map((delivery) => delivery.state).sort()).toEqual(["pending", "sent"]);

	await f.dispatch(f.ctx, [f.current()]);
	expect(f.prompts).toHaveLength(1);
	expect(f.messages).toHaveLength(1);
	expect(f.messages[0]!.terminalId).toBe(f.current().id);
	expect(await f.delivery(first.deliveryId)).toEqual({ state: "sent", error: null });
	expect(await f.delivery(second.deliveryId)).toEqual({ state: "sent", error: null });
	await f.dispatch(f.ctx, [f.current()]);
	expect(f.messages).toHaveLength(1);
});

test.each(["explicit stop", "absent", "closed assignment", "replaced attempt"])(
	"%s does not wake from a queue notice",
	async (reason) => {
		const queued = await f.queue("queued");
		if (reason === "closed assignment") await f.db.execute(sql`UPDATE agent_runs SET closed_at=now() WHERE id=${f.id}`);
		if (reason === "replaced attempt")
			await f.db.execute(sql`UPDATE agent_runs SET terminal_id='new-attempt' WHERE id=${f.id}`);
		const sessions =
			reason === "absent"
				? []
				: [{ ...f.saved, stopReason: reason === "explicit stop" ? undefined : f.saved.stopReason }];
		await f.dispatch(f.ctx, sessions);
		expect(f.prompts).toEqual([]);
		expect(f.messages).toEqual([]);
		expect(await f.delivery(queued.deliveryId)).toEqual({ state: "held", error: waitingForRun });
	},
);

test("a merge completion resumes the idle conversation after the pull request merges", async () => {
	const queued = await f.queue("merged");
	await f.db.execute(sql`UPDATE pull_requests SET state='merged' WHERE id=${queued.prId}`);

	await f.dispatch(f.ctx, [f.saved]);

	expect(f.prompts).toEqual([`trellis: your pull request merged from the merge queue: ${queued.url}.`]);
	expect(await f.delivery(queued.deliveryId)).toEqual({ state: "sent", error: null });
});

test.each(["new head", "merged", "closed"])("a notice for a PR with %s cannot resume its agent", async (reason) => {
	const queued = await f.queue();
	if (reason === "new head")
		await f.db.execute(sql`UPDATE pull_requests SET head_sha='replacement' WHERE id=${queued.prId}`);
	else await f.db.execute(sql`UPDATE pull_requests SET state=${reason} WHERE id=${queued.prId}`);
	await f.dispatch(f.ctx, [f.saved]);
	expect(f.prompts).toEqual([]);
	expect((await f.delivery(queued.deliveryId)).state).toBe("failed");
});

test.each(["conflict", "clear"] as const)("a %s notice waits for a live agent", async (kind) => {
	const queued = await f.queue(kind);
	await f.dispatch(f.ctx, [f.saved]);
	expect(f.prompts).toEqual([]);
	expect(await f.delivery(queued.deliveryId)).toEqual({ state: "held", error: waitingForRun });
});
