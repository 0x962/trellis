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
	expect(first.queueInput("request", "c3RhdHVz")).toEqual({ messageId: "request", status: "unknown" });
	expect(first.delivered("request")).toBe(false);

	const restored = new InputLedger(path);
	expect(restored.queuedInputs()).toEqual([{ messageId: "request", data: "c3RhdHVz" }]);
	const writes: string[] = [];
	expect(await restored.flushQueuedInput("request", async (data) => void writes.push(data))).toEqual({
		messageId: "request",
		status: "written",
	});
	expect(await restored.flushQueuedInput("request", async (data) => void writes.push(data))).toEqual({
		messageId: "request",
		status: "written",
	});
	expect(writes).toEqual(["c3RhdHVz"]);
	expect(new InputLedger(path).queuedInputs()).toEqual([]);
});

test("refuses another payload or transport for one message identifier", () => {
	const ledger = new InputLedger(path);
	ledger.queueInput("request", "Zmlyc3Q=");
	expect(() => ledger.queueInput("request", "c2Vjb25k")).toThrow("different bytes or transport");
	expect(() => ledger.registerNative("request", "a".repeat(64), () => {})).toThrow("different bytes or transport");
});

test("retains a queued payload after a failed write", async () => {
	const ledger = new InputLedger(path);
	ledger.queueInput("request", "c3RhdHVz");
	await expect(
		ledger.flushQueuedInput("request", async () => {
			throw new Error("closed");
		}),
	).rejects.toThrow("closed");
	expect(new InputLedger(path).queuedInputs()).toEqual([{ messageId: "request", data: "c3RhdHVz" }]);
});

test("long delivery keys replay once after restart and retain distinct suffixes", async () => {
	const prefix = "broadcast_".repeat(2_000);
	const key = `${prefix}a-recipient`;
	const other = `${prefix}b-recipient`;
	let ledger = new InputLedger(path);
	let writes = 0;
	const write = async () => {
		writes++;
	};
	await Promise.all([ledger.deliver(key, "payload", write), ledger.deliver(key, "payload", write)]);
	ledger = new InputLedger(path);
	await ledger.deliver(key, "payload", write);
	expect(writes).toBe(1);
	await ledger.deliver(other, "payload", write);
	expect(writes).toBe(2);
	await expect(ledger.deliver(key, "changed", write)).rejects.toThrow("different bytes");
	expect(writes).toBe(2);
});
