import { afterAll, beforeAll, expect, test } from "bun:test";
import { ReviewCreateSchema } from "@trellis/api";
import { ticketContext } from "../agentPrompt/ticketContext.ts";
import { get } from "../tickets/read.ts";
import { localReviewFixture } from "./localReviewState/fixture.ts";
import { add, list, reply, resolve } from "./threads.ts";

let h: Awaited<ReturnType<typeof localReviewFixture>>;
beforeAll(async () => {
	h = await localReviewFixture();
});
afterAll(async () => h.close());

test("replies and resolution preserve thread order across pages and in the ticket context", async () => {
	const first = await h.run((tx) =>
		add(h.ctx(h.human), tx, ReviewCreateSchema.parse({ pr: h.url, path: "file.ts", line: 1, body: "First" })),
	);
	const second = await h.run((tx) =>
		add(h.ctx(h.human), tx, ReviewCreateSchema.parse({ pr: h.url, path: "file.ts", line: 2, body: "Second" })),
	);
	const query = { pr: h.url, all: true, offset: 0, limit: 1 };
	expect((await h.run((tx) => list(h.ctx(h.human), tx, query))).items[0]!.id).toBe(first.id);
	await h.run((tx) => reply(h.ctx(h.human), tx, { id: first.id, body: "Reply" }));
	await h.run((tx) => resolve(h.ctx(h.human), tx, { id: first.id, resolved: true }));
	expect((await h.run((tx) => list(h.ctx(h.human), tx, { ...query, offset: 1 }))).items[0]!.id).toBe(second.id);
	const all = await h.run((tx) => list(h.ctx(h.human), tx, { ...query, limit: 100 }));
	expect(all.items.map((item) => item.id)).toEqual([first.id, second.id]);
	expect(all).toMatchObject({ total: 2, open: 1 });
	const context = await h.run(async (tx) => {
		const ctx = h.ctx(h.human).core;
		return ticketContext(ctx, tx, await get(ctx, tx, { ticket: "GLY-1" }));
	});
	const saved = JSON.parse(context["ticket.diffs_and_reviews"].slice(8, -4)) as { threads: { id: string }[] };
	expect(saved.threads.map((item) => item.id)).toEqual([first.id, second.id]);
});
