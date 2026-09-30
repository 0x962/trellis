import { expect, spyOn, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createOperationDiagnostics, type OperationEvent } from "../operationDiagnostics";
import { openTestDb } from "../testDb.ts";
import { createSessionActivityRecorder } from "./sessionActivityRecorder";

test("session activity keeps its database identity through commit and rollback without regressing activity", async () => {
	const db = await openTestDb();
	const events: OperationEvent[] = [];
	const record = createSessionActivityRecorder(
		db,
		() => undefined,
		createOperationDiagnostics((event) => events.push(event)),
	);
	const id = "session-observation";
	const older = "2026-09-29T12:00:00.000Z";
	const newer = "2026-09-29T13:00:00.000Z";
	const entered = Promise.withResolvers<void>();
	const commit = Promise.withResolvers<void>();
	try {
		await db.execute(sql`INSERT INTO projects (id, key, slug, name, created_at, updated_at)
			VALUES ('fixture-project', 'FIX', 'fixture', 'Fixture', ${older}, ${older})`);
		await db.execute(sql`INSERT INTO agent_runs (id, name, kind, instruction, project_id, project_key, created_at, updated_at)
			VALUES (${id}, 'session', 'session', 'Private fixture prompt', 'fixture-project', 'FIX', ${older}, ${older})`);
		const transaction = db.transaction.bind(db);
		const delayed = spyOn(db, "transaction").mockImplementation((fn, options) =>
			transaction(async (tx) => {
				const result = await fn(tx);
				entered.resolve();
				await commit.promise;
				return result;
			}, options),
		);
		try {
			const pending = record([{ id, activityAt: newer }]);
			await entered.promise;
			expect(events).toEqual([
				{
					type: "begin",
					operation: expect.objectContaining({
						id: 1,
						phase: "transaction.wait",
						name: "session.monitor",
						reqId: "session.monitor",
					}),
				},
				{ type: "end", id: 1, at: expect.any(Number), outcome: "success" },
				{
					type: "begin",
					operation: expect.objectContaining({
						id: 2,
						phase: "transaction",
						name: "session.monitor",
						reqId: "session.monitor",
					}),
				},
			]);
			commit.resolve();
			await pending;
			expect(events.at(-1)).toMatchObject({ type: "end", id: 2, outcome: "success" });
		} finally {
			commit.resolve();
			delayed.mockRestore();
		}
		await record([{ id, activityAt: older }]);
		await expect(record([{ id, activityAt: "invalid timestamp" }])).rejects.toThrow();
		expect(events.at(-1)).toMatchObject({ type: "end", outcome: "failure" });
		const rows = await db.execute<{ unchanged: boolean }>(
			sql`SELECT activity_at=${newer}::timestamptz AS unchanged FROM agent_runs WHERE id=${id}`,
		);
		expect(rows.rows[0]!.unchanged).toBe(true);
		const starts = events.filter((event) => event.type === "begin");
		expect(
			events
				.filter((event) => event.type === "end")
				.map((event) => event.id)
				.sort(),
		).toEqual(starts.map((event) => event.operation.id).sort());
		expect(JSON.stringify(events)).not.toContain("Private fixture prompt");
	} finally {
		commit.resolve();
		await db.$client.close();
	}
});
