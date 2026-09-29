import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputLedger } from "./inputLedger.ts";

let directory: string;
let path: string;

beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), "trellis-input-queue-"));
	path = join(directory, "input.json");
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

test("keeps a queued message across restart and writes it once", async () => {
	const first = new InputLedger(path);
	expect(first.queue("request", "c3RhdHVz")).toEqual({ messageId: "request", status: "unknown" });
	expect(first.delivered("request")).toBe(false);

	const restored = new InputLedger(path);
	expect(restored.queued()).toEqual([{ messageId: "request", data: "c3RhdHVz" }]);
	const writes: string[] = [];
	expect(await restored.flushQueued("request", async (data) => void writes.push(data))).toEqual({
		messageId: "request",
		status: "written",
	});
	expect(await restored.flushQueued("request", async (data) => void writes.push(data))).toEqual({
		messageId: "request",
		status: "written",
	});
	expect(writes).toEqual(["c3RhdHVz"]);
	expect(new InputLedger(path).queued()).toEqual([]);
});

test("refuses another payload or transport for one message identifier", () => {
	const ledger = new InputLedger(path);
	ledger.queue("request", "Zmlyc3Q=");
	expect(() => ledger.queue("request", "c2Vjb25k")).toThrow("different bytes or transport");
	expect(() => ledger.registerNative("request", "a".repeat(64), () => {})).toThrow("different bytes or transport");
});

test("retains a queued payload after a failed write", async () => {
	const ledger = new InputLedger(path);
	ledger.queue("request", "c3RhdHVz");
	await expect(
		ledger.flushQueued("request", async () => {
			throw new Error("closed");
		}),
	).rejects.toThrow("closed");
	expect(new InputLedger(path).queued()).toEqual([{ messageId: "request", data: "c3RhdHVz" }]);
});
