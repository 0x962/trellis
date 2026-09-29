import { afterEach, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { protocolDigest } from "../../../langflowContracts";
import { type Db, openDb } from "../../client";
import { migrate } from "../../migrate";
import { ids, now, receiptFixture } from "./fixtures/fixture";
import { beforeDocuments } from "./fixtures/migration";
import { handle, nativeRequest } from "./fixtures/native";
import { bindLaunchSnapshot } from "./launchSnapshot";
import { reserveNative } from "./native";

let db: Db;
afterEach(async () => {
	await db.$client.close();
});
test("binds a snapshot once inside the reservation transaction", async () => {
	const fixture = await receiptFixture();
	db = fixture.db;
	const reservation = {
		requestBytes: JSON.stringify(nativeRequest),
		taskKey: "root/step",
		handle,
		authority: fixture.authority,
		now,
	};
	const binding = {
		executionId: ids.execution,
		stepId: handle.stepId,
		attemptId: handle.attemptId,
		digest: protocolDigest("private snapshot bytes"),
	};
	await expect(
		db.transaction(async (tx) => {
			await reserveNative(tx, reservation);
			await bindLaunchSnapshot(tx, binding);
			throw new Error("abort");
		}),
	).rejects.toThrow("abort");
	expect((await db.execute(sql`SELECT count(*)::int AS n FROM langflow_native_handles`)).rows).toEqual([{ n: 0 }]);
	const saved = await db.transaction(async (tx) => {
		await reserveNative(tx, reservation);
		return bindLaunchSnapshot(tx, binding);
	});
	expect(saved.launchSnapshotDigest).toBe(binding.digest);
	expect(await db.transaction((tx) => bindLaunchSnapshot(tx, binding))).toEqual(saved);
	await expect(
		db.transaction((tx) => bindLaunchSnapshot(tx, { ...binding, digest: protocolDigest("changed") })),
	).rejects.toThrow("native_snapshot_digest_conflict");
	await expect(
		db.transaction((tx) => bindLaunchSnapshot(tx, { ...binding, attemptId: crypto.randomUUID() })),
	).rejects.toThrow("native_snapshot_binding_conflict");
	await expect(db.transaction((tx) => bindLaunchSnapshot(tx, { ...binding, stepId: "other" }))).rejects.toThrow(
		"native_snapshot_binding_conflict",
	);
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => bindLaunchSnapshot(tx, binding))).toEqual(saved);
});
test("the forward migration preserves a historical reservation with an unknown snapshot", async () => {
	db = await beforeDocuments(135);
	await receiptFixture(true, db);
	const requestBytes = JSON.stringify(nativeRequest);
	const key = "historical";
	const digest = protocolDigest(key);
	await db.execute(sql`INSERT INTO langflow_native_handles
	(step_id, execution_id, task_key, task_digest, semantic_key, semantic_digest, occurrence_key, occurrence_digest, request_id, agent_run_id, attempt_id, request_bytes, request_digest, provenance, handle)
	VALUES (${handle.stepId}, ${ids.execution}, ${key}, ${digest}, ${key}, ${digest}, ${key}, ${digest}, ${nativeRequest.requestId}, ${handle.agentRunId}, ${handle.attemptId}, ${requestBytes}, ${protocolDigest(requestBytes)}, ${JSON.stringify({ request: nativeRequest })}::jsonb, ${JSON.stringify(handle)}::jsonb)`);
	expect(await migrate(db)).toBe(1);
	expect((await db.execute(sql`SELECT launch_snapshot_digest FROM langflow_native_handles`)).rows).toEqual([
		{ launch_snapshot_digest: null },
	]);
	await expect(
		db.execute(sql`UPDATE langflow_native_handles SET launch_snapshot_digest='NOT-A-DIGEST'`),
	).rejects.toThrow();
	await expect(
		db.execute(sql`UPDATE langflow_native_handles SET launch_snapshot_digest=${"A".repeat(64)}`),
	).rejects.toThrow();
	expect((await db.execute(sql`SELECT request_bytes FROM langflow_native_handles`)).rows).toEqual([
		{ request_bytes: requestBytes },
	]);
}, 60000);
