import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { prepareWatchDispatch } from "../dispatchWatches";
import { agentId, db, later, pageWithWatcher, watchCtx, watchRow, watchTx } from "./watches.fixture";

export function registerResumeCases() {
	test.each([false, true])(
		"a resumed watcher retargets only an unregistered batch (registered: %s)",
		async (registered) => {
			const f = await pageWithWatcher();
			await f.comment("Stopped after reservation");
			const batch = (await f.reserve())!;
			const replacement = randomUUID();
			await db.execute(sql`UPDATE agent_runs SET terminal_id = ${replacement} WHERE id = ${agentId}`);
			let sends = 0;
			const errors: unknown[] = [];
			const context = {
				...watchCtx(later()),
				log: (_message: string, detail?: Record<string, unknown>) => {
					expect(detail).toMatchObject({ pageId: f.id, agentId, messageId: batch.messageId });
					expect(detail).toHaveProperty("terminalId");
					if (_message === "Page comment delivery held") errors.push(detail);
				},
			};
			await prepareWatchDispatch(
				context,
				{},
				{
					read: async () => [{ id: replacement, status: "running", controllable: true }] as RuntimeProcessStatus[],
					receipt: async (id, messageId) => {
						expect(id).toBe(agentId);
						return { messageId, registered, delivered: false, status: "exited" };
					},
					send: async (_ctx, input) => {
						expect(input.expectedTerminalId).toBe(replacement);
						expect(input.messageId).toBe(batch.messageId);
						expect(input.text).toBe(batch.payload.text);
						sends++;
						return { id: input.id };
					},
				},
			);
			expect(sends).toBe(registered ? 0 : 1);
			expect(errors).toHaveLength(registered ? 1 : 0);
			expect((await watchRow(f.id)).cursor_id === null).toBe(registered);
			await db.execute(sql`UPDATE agent_runs SET terminal_id = ${agentId} WHERE id = ${agentId}`);
		},
	);

	test("a database failure during batch reassignment rejects the dispatch", async () => {
		const f = await pageWithWatcher();
		await f.comment("Resume after reservation");
		await f.reserve();
		const terminalId = randomUUID();
		await db.execute(sql`UPDATE agent_runs SET terminal_id = ${terminalId} WHERE id = ${agentId}`);
		let transactions = 0;
		const context = {
			...watchCtx(later()),
			newTx: ((fn) => {
				if (++transactions === 3) throw new Error("database reassignment failed");
				return watchTx(fn);
			}) as typeof watchTx,
		};
		await expect(
			prepareWatchDispatch(
				context,
				{},
				{
					read: async () => [{ id: terminalId, status: "running", controllable: true }] as RuntimeProcessStatus[],
					receipt: async (_id, messageId) => ({ messageId, registered: false, delivered: false, status: "exited" }),
					send: async () => {
						throw new Error("Must not send after database failure");
					},
				},
			),
		).rejects.toThrow("database reassignment failed");
		expect((await watchRow(f.id)).cursor_id).toBeNull();
		await db.execute(sql`UPDATE agent_runs SET terminal_id = ${agentId} WHERE id = ${agentId}`);
	});
}
