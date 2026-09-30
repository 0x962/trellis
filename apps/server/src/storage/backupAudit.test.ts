import { expect, spyOn, test } from "bun:test";
import * as files from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { loadConfig } from "../config.ts";
import { backupFixture } from "../db/backupFixture";
import { bulkObjects } from "../db/backupFixture/bulkObjects";
import { openDatabase } from "../db/open.ts";
import { createOperationDiagnostics } from "../db/operationDiagnostics";
import { createInlineTransport } from "../db/transport.ts";
import { createBus } from "../events/bus.ts";
import { restoreHome } from "../restore.ts";
import { createDbTiming } from "../serverTiming.ts";
import { archive, type Snapshot } from "../services/system.ts";
import { blobPath } from "./blobs.ts";
import { hashFile } from "./hashStore.ts";
import { pageObjectPath } from "./pageObjects.ts";

test("copies 4096 objects outside the database hold and restores every object", async () => {
	const fixture = await backupFixture();
	const config = loadConfig({ TRELLIS_HOME: fixture.home, TRELLIS_PORT: "0" });
	const activeTransactions = new Set<number>();
	const holds: number[] = [];
	const diagnostics = createOperationDiagnostics((event) => {
		if (event.type === "begin" && event.operation.phase === "transaction" && event.operation.name === "system.snapshot")
			activeTransactions.add(event.operation.id);
		if (event.type === "end") activeTransactions.delete(event.id);
	});
	const transport = createInlineTransport({
		db: fixture.db,
		config,
		diagnostics,
		bus: createBus({ bootId: fixture.ctx.bootId }),
		runtime: fixture.ctx,
		longTransactionMs: 0,
		log: (_message, fields) => {
			if (fields?.service === "system.snapshot") holds.push(fields.heldMs as number);
		},
	});
	let observer: ReturnType<typeof spyOn> | undefined;
	try {
		const inventory = await bulkObjects(fixture, 2048);
		await transport.start();
		const backupTiming = createDbTiming();
		const ticketTiming = createDbTiming();
		const read = Promise.withResolvers<unknown>();
		let copied = 0;
		let copiesInsideTransaction = 0;
		let readCompletedAfterCopies = 0;
		let ticketReadMs = 0;
		let copyStartedAt = 0;
		let copyEndedAt = 0;
		const copy = files.copyFile;
		observer = spyOn(files, "copyFile").mockImplementation(async (...args) => {
			if (activeTransactions.size > 0) copiesInsideTransaction++;
			if (copied === 0) copyStartedAt = performance.now();
			await copy(...args);
			copied++;
			copyEndedAt = performance.now();
			if (copied === 1) {
				const startedAt = performance.now();
				void transport.call("tickets.get", fixture.core, { ticket: fixture.ticketId }, ticketTiming).then((ticket) => {
					ticketReadMs = performance.now() - startedAt;
					readCompletedAfterCopies = copied;
					read.resolve(ticket);
				}, read.reject);
			}
		});
		const startedAt = performance.now();
		const taken = (await transport.call("system.snapshot", fixture.core, {}, backupTiming)) as Snapshot;
		const snapshotMs = performance.now() - startedAt;
		expect(await read.promise).toMatchObject({ id: fixture.ticketId, title: "Before backup" });
		expect(copied).toBe(4096);
		expect(copiesInsideTransaction).toBe(0);
		expect(readCompletedAfterCopies).toBeLessThan(copied);
		expect(Math.max(...holds)).toBeLessThan(1000);
		expect(ticketReadMs).toBeLessThan(1000);
		observer.mockRestore();
		const output = await archive(taken);
		const restoredHome = join(fixture.home, "restored");
		await restoreHome(restoredHome, output.path);
		const restored = await openDatabase(join(restoredHome, "db"));
		try {
			for (const [objects, pathOf] of [
				[inventory.blobs, blobPath],
				[inventory.pages, pageObjectPath],
			] as const) {
				for (const object of objects) {
					expect(await hashFile(Bun.file(pathOf(restoredHome, object.sha256)), () => {})).toEqual({
						sha256: object.sha256,
						size: object.size,
					});
				}
			}
			expect((await restored.db.execute(sql`SELECT count(*)::int AS count FROM attachments`)).rows).toEqual([
				{ count: 2048 },
			]);
			expect((await restored.db.execute(sql`SELECT count(*)::int AS count FROM page_uploads`)).rows).toEqual([
				{ count: 2048 },
			]);
		} finally {
			await restored.close();
		}
		console.log(
			JSON.stringify({
				audit: "backup-retention",
				attachments: 2048,
				pageObjects: 2048,
				objectBytes: 64 * 1024 * 1024,
				transactionHoldsMs: holds,
				totalDatabaseMs: backupTiming.ms,
				snapshotMs,
				bulkCopyMs: copyEndedAt - copyStartedAt,
				copiesInsideTransaction,
				ticketReadMs,
				ticketDatabaseMs: ticketTiming.ms,
				readCompletedAfterCopies,
				restoredObjects: copied,
				archiveBytes: output.bytes,
			}),
		);
	} finally {
		observer?.mockRestore();
		await transport.close();
		await fixture.close();
	}
}, 60_000);
