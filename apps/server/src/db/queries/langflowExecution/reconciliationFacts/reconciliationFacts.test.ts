import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../../langflowContracts";
import { type Db, openDb } from "../../../client";
import { migrate } from "../../../migrate";
import { agentRuns } from "../../../tables/agentRuns";
import { sessions } from "../../../tables/sessions";
import { ids, now, receiptFixture } from "../fixtures/fixture";
import { beforeDocuments } from "../fixtures/migration";
import { handle, nativeRequest } from "../fixtures/native";
import { reserveNative } from "../native";
import { readReconciliationFacts } from "./readReconciliationFacts";
import { readReconciliationMigrations } from "./readReconciliationMigrations";
import { ReconciliationFactsSchema } from "./schema";

let db: Db;
afterEach(async () => db.$client.close());
async function setup() {
	db = await beforeDocuments(142);
	await migrate(db);
	return receiptFixture(true, db);
}

test("retains canonical database bytes across reopen and uses one migration representation", async () => {
	await setup();
	const original = await db.transaction(readReconciliationFacts);
	expect(ReconciliationFactsSchema.parse(original)).toEqual(original);
	expect(await db.transaction(readReconciliationMigrations)).toEqual(original.migrations);
	const rows = (
		await db.execute(sql`SELECT id::text AS id, hash::text AS hash,
		created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id`)
	).rows;
	expect(JSON.parse(original.migrations.sourceBytes)).toEqual({ version: 1, rows });
	const names = (JSON.parse(original.facts.sourceBytes) as { tables: { name: string }[] }).tables.map(
		(table) => table.name,
	);
	const actual = await db.execute<{ name: string }>(sql`
		SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND starts_with(tablename, 'langflow_')
	`);
	expect(names).toEqual([...actual.rows.map((row) => row.name), "retained_native_associations"].sort());
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction(readReconciliationFacts)).toEqual(original);
	expect(
		ReconciliationFactsSchema.safeParse({
			...original,
			facts: { ...original.facts, sourceBytes: `${original.facts.sourceBytes} ` },
		}).success,
	).toBe(false);
}, 60000);

test("reads original bytes and native associations through the held caller transaction", async () => {
	const fixture = await setup();
	await db.insert(agentRuns).values({
		id: handle.agentRunId,
		name: "Native fixture",
		kind: "flow",
		instruction: "Read the fixture.",
		projectKey: "TRL",
		workspaceId: "/retained/workspace",
		terminalId: handle.attemptId,
		sessionId: "provider-session",
		createdAt: now,
		updatedAt: now,
	});
	await db.insert(sessions).values({
		id: "retained-session",
		name: "Retained session",
		directory: "/retained/workspace",
		harness: {},
		runId: handle.agentRunId,
		createdAt: now,
		updatedAt: now,
	});
	const requestBytes = ` ${JSON.stringify(nativeRequest)}\r\n`;
	const original = await db.transaction(readReconciliationFacts);
	await expect(
		db.transaction(async (tx) => {
			await reserveNative(tx, { requestBytes, taskKey: "root/step", handle, authority: fixture.authority, now });
			const held = await readReconciliationFacts(tx);
			expect(held.facts.sourceDigest).not.toBe(original.facts.sourceDigest);
			expect(held.facts.sourceDigest).toBe(protocolDigest(held.facts.sourceBytes));
			const tables = JSON.parse(held.facts.sourceBytes).tables as { name: string; rows: Record<string, unknown>[] }[];
			expect(tables.find((table) => table.name === "langflow_native_handles")!.rows[0]!.request_bytes).toBe(
				requestBytes,
			);
			expect(tables.find((table) => table.name === "retained_native_associations")!.rows).toEqual([
				{
					execution_id: ids.execution,
					step_id: handle.stepId,
					attempt_id: handle.attemptId,
					agent_run_id: handle.agentRunId,
					agent_run: {
						id: handle.agentRunId,
						terminal_id: handle.attemptId,
						session_id: "provider-session",
						workspace_id: "/retained/workspace",
						session_lost: false,
					},
					session: { id: "retained-session", run_id: handle.agentRunId, directory: "/retained/workspace" },
				},
			]);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect(await db.transaction(readReconciliationFacts)).toEqual(original);
}, 60000);
