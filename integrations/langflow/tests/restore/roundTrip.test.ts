import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readProjectionFacts } from "../../../../apps/server/src/db/queries/langflowExecution/facts";
import { reserveNative } from "../../../../apps/server/src/db/queries/langflowExecution/native";
import * as schema from "../../../../apps/server/src/db/schema";
import {
	assertRestoreReconciled,
	captureSnapshot,
	restoreSnapshot,
} from "../../../../apps/server/src/services/langflowBackup";
import { recoveryName } from "../../../../apps/server/src/services/langflowBackup/manifest";
import { fixture } from "./fixture";
import { receiptData } from "./receiptData";

test("restores paired bytes and receipt identities while later source records remain", async () => {
	const files = await fixture();
	const stored = await receiptData();
	const { db, facts, ids } = stored;
	try {
		const enginePath = join(files.snapshot, "engine", "jobs.sqlite");
		const engine = new Database(enginePath);
		engine.exec(
			"CREATE TABLE jobs (id TEXT PRIMARY KEY, checkpoint TEXT, state TEXT); CREATE TABLE effects (attempt TEXT PRIMARY KEY)",
		);
		engine
			.query("INSERT INTO jobs VALUES (?, ?, ?)")
			.run(stored.request.authority.engineJobId, "retained-wait", "waiting");
		engine.query("INSERT INTO effects VALUES (?)").run(stored.request.handle.attemptId);
		engine.close();
		await Bun.write(join(files.snapshot, "trellis", "pglite.tar.gz"), await db.$client.dumpDataDir());
		const snapshot = await captureSnapshot({
			withQuiescedSnapshot: async (consume) => consume({ directory: files.snapshot, metadata: files.metadata }),
		});
		await db.execute(sql`INSERT INTO tickets VALUES ('ticket-after')`);
		await db.execute(sql`INSERT INTO restore_review_fixture VALUES ('review-after', 'Later finding')`);
		let blocks = 0;
		const restored = await restoreSnapshot(
			{
				blockDispatch: async ({ directory, manifest }) => {
					blocks += 1;
					expect(await readFile(join(directory, recoveryName), "utf8")).toContain(manifest.snapshotId);
					expect(await Bun.file(join(directory, "payload", "trellis", "pglite.tar.gz")).exists()).toBe(false);
					await writeFile(join(files.root, "fixture-dispatch-block"), manifest.snapshotId, { mode: 0o600 });
				},
			},
			{ snapshot: files.snapshot, destination: files.destination, compatibility: files.metadata.compatibility },
		);
		expect(blocks).toBe(1);
		expect(restored.state).toBe("requires-reconciliation");
		expect(restored.manifest.unavailable).toEqual(files.metadata.unavailable);
		await expect(assertRestoreReconciled(files.destination)).rejects.toThrow("restore_requires_reconciliation");
		const client = await PGlite.create({ loadDataDir: Bun.file(join(restored.payload, "trellis", "pglite.tar.gz")) });
		try {
			const recovered = drizzle({ client, schema });
			expect(await recovered.transaction((tx) => readProjectionFacts(tx, { executionId: ids.execution }))).toEqual(
				facts,
			);
			const before = await client.query("SELECT * FROM langflow_document_publications");
			expect(before.rows).toEqual((await db.$client.query("SELECT * FROM langflow_document_publications")).rows);
			expect((await client.query("SELECT * FROM flow_executions")).rows).toEqual([{ id: "legacy-run" }]);
			expect((await client.query("SELECT * FROM tickets WHERE id = 'ticket-after'")).rows).toEqual([]);
			expect((await db.$client.query("SELECT * FROM tickets WHERE id = 'ticket-after'")).rows).toEqual([
				{ id: "ticket-after" },
			]);
			expect((await db.$client.query("SELECT * FROM restore_review_fixture WHERE id = 'review-after'")).rows).toEqual([
				{ id: "review-after", body: "Later finding" },
			]);
			expect((await client.query("SELECT * FROM restore_review_fixture")).rows).toEqual([
				{ id: "review-before", body: "Retained finding" },
			]);
			const original = await recovered.transaction((tx) => reserveNative(tx, stored.request));
			expect(original.handle.attemptId).toBe(stored.request.handle.attemptId);
			expect((await client.query("SELECT * FROM langflow_native_handles")).rows).toHaveLength(2);
		} finally {
			await client.close();
		}
		const copiedEngine = new Database(join(restored.payload, "engine", "jobs.sqlite"), { readonly: true });
		try {
			expect(copiedEngine.query("SELECT * FROM jobs").all()).toEqual([
				{ id: stored.request.authority.engineJobId, checkpoint: "retained-wait", state: "waiting" },
			]);
			expect(copiedEngine.query("SELECT * FROM effects").all()).toEqual([{ attempt: stored.request.handle.attemptId }]);
		} finally {
			copiedEngine.close();
		}
		for (const file of snapshot.manifest.files) {
			expect(await readFile(join(restored.payload, file.path))).toEqual(
				await readFile(join(files.snapshot, file.path)),
			);
			expect((await stat(join(restored.payload, file.path))).mode & 0o777).toBe(file.executable ? 0o700 : 0o600);
		}
		await mkdir(join(files.root, "active-home"));
		await writeFile(join(files.root, "active-home", "later-record"), "preserve");
		await expect(
			restoreSnapshot(
				{
					blockDispatch: async () => {
						throw new Error("must-not-run");
					},
				},
				{
					snapshot: files.snapshot,
					destination: join(files.root, "active-home"),
					compatibility: files.metadata.compatibility,
				},
			),
		).rejects.toThrow("EEXIST");
		expect(await readFile(join(files.root, "active-home", "later-record"), "utf8")).toBe("preserve");
	} finally {
		await db.$client.close();
		await rm(files.root, { recursive: true });
	}
}, 60_000);
