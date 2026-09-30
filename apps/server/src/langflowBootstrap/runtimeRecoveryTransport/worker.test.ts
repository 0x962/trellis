import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../config";
import { systemContext } from "../../context";
import { openTestDb } from "../../db/testDb";
import { createInlineTransport, type Runtime } from "../../db/transport";
import { createBus } from "../../events/bus";
import { LangflowHostControl } from "../../langflowHost";
import { runtimeRecoveryTransport } from "./runtimeRecoveryTransport";

test("the registered worker uses its own home and leaves transactions before the domain call", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-runtime-recovery-port-"));
	const db = await openTestDb();
	const config = loadConfig({ TRELLIS_HOME: home, TRELLIS_PORT: "0" });
	const runtime: Runtime = {
		version: "test",
		bootId: "test",
		gh: Object.assign(async () => ({ ok: true as const, code: 0, stdout: "", stderr: "" }), {
			bin: "unused",
			timeoutMs: 1000,
		}),
		ghStatus: () => ({ ok: true, user: null, reason: null, message: null, checkedAt: "2026-09-29T00:00:00.000Z" }),
		addresses: async () => [],
	};
	const transport = createInlineTransport({ db, config, runtime, bus: createBus({ bootId: runtime.bootId }) });
	const execute = db.transaction.bind(db);
	let activeTransactions = 0;
	const transaction = spyOn(db, "transaction").mockImplementation(async (fn, options) => {
		activeTransactions++;
		try {
			return await execute(fn, options);
		} finally {
			activeTransactions--;
		}
	});
	const failure = new Error("capture_control_boundary");
	const observed: Array<{ home: string; activeTransactions: number }> = [];
	const control = spyOn(LangflowHostControl, "openCapture").mockImplementation((input) => {
		observed.push({ home: input.home, activeTransactions });
		throw failure;
	});
	try {
		const port = runtimeRecoveryTransport(transport);
		await expect(port.recoverPairedRuntimeFinalization({ snapshotId: "saved-snapshot" })).rejects.toBe(failure);
		expect(observed).toEqual([{ home, activeTransactions: 0 }]);
		await expect(
			transport.call(
				"langflowBackup.recoverRuntimeFinalization",
				{ ...systemContext(), actor: { kind: "human", name: "fixture" } },
				{ snapshotId: "saved-snapshot" },
			),
		).rejects.toThrow("paired_capture_requires_system_actor");
		expect(observed).toHaveLength(1);
	} finally {
		await transport.close();
		control.mockRestore();
		transaction.mockRestore();
		await db.$client.close();
		await rm(home, { recursive: true, force: true });
	}
});
