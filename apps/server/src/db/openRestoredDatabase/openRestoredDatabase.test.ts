import { expect, test } from "bun:test";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../config";
import { createBus } from "../../events/bus";
import { LangflowHostControl } from "../../langflowHost";
import { readRestoredDatabaseOpen } from "../../langflowHost/restoredDatabase";
import { openDatabase } from "../open";
import { readReconciliationFacts } from "../queries/langflowExecution/reconciliationFacts";
import { createWorkerTransport, type Runtime } from "../transport";
import { restoredDatabaseFixture } from "./components/fixture";

test("restore configuration requires the exact install receipt digest", () => {
	expect(loadConfig({}).restoredDatabaseInstallReceipt).toBeUndefined();
	const digest = "a".repeat(64);
	expect(loadConfig({ TRELLIS_RESTORED_DATABASE_INSTALL_RECEIPT: digest }).restoredDatabaseInstallReceipt).toBe(
		digest,
	);
	for (const invalid of ["", "receipt", digest.toUpperCase(), `${digest}\n`])
		expect(() => loadConfig({ TRELLIS_RESTORED_DATABASE_INSTALL_RECEIPT: invalid })).toThrow();
});

test("the actual inline open archives the facts from its own database", async () => {
	const f = await restoredDatabaseFixture();
	let opened: Awaited<ReturnType<typeof openDatabase>> | undefined;
	try {
		const bootId = crypto.randomUUID();
		opened = await openDatabase(f.dataDir, { home: f.home, installReceiptId: f.installReceiptId, bootId });
		if (opened.restoredOpen === null) throw new Error("Missing actual open receipt");
		const recorded = readRestoredDatabaseOpen({ home: f.home, bootId, receiptId: opened.restoredOpen.receiptId });
		const actual = await opened.db.transaction(readReconciliationFacts);
		expect(actual).toEqual(f.expected);
		expect(recorded.record.evidence).toEqual({ dataDir: f.dataDir, bootId, ...actual });
		expect(recorded.sourceBytes).toBe(opened.restoredOpen.sourceBytes);
		expect(recorded.record.verified.block).toEqual(f.block);
		expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
	} finally {
		await opened?.close();
		await f.remove();
	}
}, 30_000);

test("the actual worker returns the receipt for its own boot", async () => {
	const f = await restoredDatabaseFixture();
	const bootId = crypto.randomUUID();
	const config = loadConfig({
		TRELLIS_HOME: f.home,
		TRELLIS_PORT: "0",
		TRELLIS_RESTORED_DATABASE_INSTALL_RECEIPT: f.installReceiptId,
	});
	const runtime: Runtime = {
		version: "test",
		bootId,
		gh: Object.assign(async () => ({ ok: true as const, code: 0, stdout: "", stderr: "" }), {
			bin: "unused",
			timeoutMs: 1000,
		}),
		ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: new Date().toISOString() }),
		addresses: async () => [],
	};
	const transport = createWorkerTransport({ config, runtime, bus: createBus({ bootId }) });
	try {
		const started = await transport.start();
		if (started.restoredOpen === undefined) throw new Error("Missing worker open receipt");
		const recorded = readRestoredDatabaseOpen({ home: f.home, bootId, receiptId: started.restoredOpen.receiptId });
		expect(recorded.record.evidence).toEqual({ dataDir: f.dataDir, bootId, ...f.expected });
		expect(recorded.sourceBytes).toBe(started.restoredOpen.sourceBytes);
		expect(recorded.sourceDigest).toBe(started.restoredOpen.sourceDigest);
		expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
	} finally {
		await transport.close();
		await f.remove();
	}
}, 30_000);

test("changed installed bytes refuse before the actual database open", async () => {
	const f = await restoredDatabaseFixture();
	try {
		await appendFile(join(f.dataDir, "PG_VERSION"), "changed");
		await expect(
			openDatabase(f.dataDir, {
				home: f.home,
				installReceiptId: f.installReceiptId,
				bootId: crypto.randomUUID(),
			}),
		).rejects.toThrow("restored_database_bytes_changed");
		expect(LangflowHostControl.recovery(f.home).state).toBe("blocked");
	} finally {
		await f.remove();
	}
}, 30_000);
