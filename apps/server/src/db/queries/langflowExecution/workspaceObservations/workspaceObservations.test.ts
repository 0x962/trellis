import { afterEach, expect, test } from "bun:test";
import { type Db, openDb } from "../../../client";
import { migrate } from "../../../migrate";
import { readProjectionFacts } from "../facts";
import { ids, now, receiptFixture } from "../fixtures/fixture";
import { beforeDocuments } from "../fixtures/migration";
import { handle, nativeRequest } from "../fixtures/native";
import { reserveNative } from "../native";
import { readWorkspaceObservation, writeWorkspaceObservation } from "./workspaceObservations";

let db: Db;
afterEach(async () => db.$client.close());
async function setup() {
	db = await beforeDocuments(141);
	await migrate(db);
	const fixture = await receiptFixture(true, db);
	await db.transaction((tx) => reserveNative(tx, {
		requestBytes: JSON.stringify(nativeRequest), taskKey: "outer/501/review",
		handle: { ...handle, workspaceId: "workspace-1" }, authority: fixture.authority, now,
	}));
	return {
		executionId: ids.execution, stepId: handle.stepId, attemptId: handle.attemptId,
		workspaceId: "workspace-1", workspaceCommit: null, observedAt: now,
	};
}

test("retains a workspace fact before projection and preserves it through reopen", async () => {
	const input = await setup();
	const saved = await db.transaction((tx) => writeWorkspaceObservation(tx, input));
	const archive = await db.$client.dumpDataDir();
	await db.$client.close();
	db = await openDb(":memory:", archive);
	expect(await db.transaction((tx) => readWorkspaceObservation(tx, input))).toEqual(saved);
	expect((await db.transaction((tx) => readProjectionFacts(tx, input))).workspaceObservations).toEqual([saved]);
}, 60000);

test("orders observations and never erases a known commit with null", async () => {
	const input = await setup();
	await db.transaction((tx) => writeWorkspaceObservation(tx, input));
	const at = (offset: number) => new Date(now.getTime() + offset);
	const first = { ...input, workspaceCommit: "a".repeat(40), observedAt: at(1) };
	await db.transaction((tx) => writeWorkspaceObservation(tx, first));
	const equal = await db.transaction((tx) => writeWorkspaceObservation(tx, { ...first, observedAt: at(2) }));
	expect(equal.observedAt).toEqual(at(2));
	const unknown = await db.transaction((tx) => writeWorkspaceObservation(tx, { ...input, observedAt: at(3) }));
	expect(unknown.workspaceCommit).toBe(first.workspaceCommit);
	expect(unknown.observedAt).toEqual(at(3));
	await expect(db.transaction((tx) => writeWorkspaceObservation(tx, {
		...first, workspaceCommit: "b".repeat(40), observedAt: at(2),
	}))).rejects.toThrow("workspace_observation_older");
	await expect(db.transaction((tx) => writeWorkspaceObservation(tx, {
		...first, workspaceCommit: "b".repeat(40), observedAt: at(3),
	}))).rejects.toThrow("workspace_observation_conflict");
	expect((await db.transaction((tx) => writeWorkspaceObservation(tx, {
		...first, workspaceCommit: "b".repeat(40), observedAt: at(4),
	}))).workspaceCommit).toBe("b".repeat(40));
}, 60000);

test("requires exact reservation identity and rolls back facts with their transaction", async () => {
	const input = await setup();
	for (const change of [{ attemptId: "other-attempt" }, { workspaceId: "other-workspace" }, { stepId: "other-step" }]) {
		await expect(db.transaction((tx) => writeWorkspaceObservation(tx, { ...input, ...change })))
			.rejects.toThrow("workspace_observation_identity_conflict");
	}
	await expect(db.transaction(async (tx) => {
		await writeWorkspaceObservation(tx, input);
		throw new Error("abort");
	})).rejects.toThrow("abort");
	expect(await db.transaction((tx) => readWorkspaceObservation(tx, input))).toBeNull();
}, 60000);
