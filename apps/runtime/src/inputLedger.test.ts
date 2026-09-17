import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { InputLedger } from "./inputLedger.ts";

test("concurrent deliveries share a delayed write and reject changed bytes", async () => {
	const home = mkdtempSync("/tmp/trl-ledger-");
	try {
		const path = join(home, "input.json");
		const ledger = new InputLedger(path);
		const completion = Promise.withResolvers<void>();
		let writes = 0;
		const write = () => {
			writes++;
			return completion.promise;
		};
		const first = ledger.deliver("message", "bytes", write);
		const duplicate = ledger.deliver("message", "bytes", write);
		await expect(ledger.deliver("message", "changed", write)).rejects.toThrow("different bytes");
		expect(writes).toBe(1);
		expect((await new InputLedger(path).deliver("message", "bytes", write)).status).toBe("unknown");
		expect(writes).toBe(1);
		completion.resolve();
		expect((await first).status).toBe("written");
		expect((await duplicate).status).toBe("written");
		expect((await new InputLedger(path).deliver("message", "bytes", write)).status).toBe("written");
		expect(writes).toBe(1);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("a delayed failed write remains unknown after restart and never repeats", async () => {
	const home = mkdtempSync("/tmp/trl-ledger-");
	try {
		const path = join(home, "input.json");
		const ledger = new InputLedger(path);
		const completion = Promise.withResolvers<void>();
		let writes = 0;
		const write = () => {
			writes++;
			return completion.promise;
		};
		const first = ledger.deliver("message", "bytes", write);
		const duplicate = ledger.deliver("message", "bytes", write);
		completion.reject(new Error("write EPIPE"));
		const results = await Promise.allSettled([first, duplicate]);
		expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
		expect((await ledger.deliver("message", "bytes", write)).status).toBe("unknown");
		expect((await new InputLedger(path).deliver("message", "bytes", write)).status).toBe("unknown");
		expect(writes).toBe(1);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("known delivery acknowledgements persist and unknown IDs do not create receipts", async () => {
	const home = mkdtempSync("/tmp/trl-ledger-");
	try {
		const path = join(home, "input.json");
		const ledger = new InputLedger(path);
		await ledger.deliver("known", "bytes", async () => {});
		ledger.acknowledge("unknown");
		expect(ledger.acknowledgedMessageIds()).toEqual([]);
		ledger.acknowledge("known");
		expect(ledger.acknowledgedMessageIds()).toEqual(["known"]);
		expect(new InputLedger(path).acknowledgedMessageIds()).toEqual(["known"]);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("native reservations retain uncertainty across reload and reject a transport change", async () => {
	const home = mkdtempSync("/tmp/trl-native-ledger-");
	try {
		const path = join(home, "input.json");
		let claims = 0;
		const first = new InputLedger(path);
		expect(
			first.registerNative("native", "digest", () => {
				claims++;
			}),
		).toMatchObject({ claimed: true, status: "unknown" });
		const loaded = new InputLedger(path);
		expect(
			loaded.registerNative("native", "digest", () => {
				claims++;
			}),
		).toMatchObject({ claimed: false, status: "unknown" });
		expect(claims).toBe(1);
		await expect(
			loaded.deliver("native", "digest", async () => {
				claims++;
			}),
		).rejects.toThrow("different");
		loaded.acknowledge("native");
		expect(
			new InputLedger(path).registerNative("native", "digest", () => {
				claims++;
			}),
		).toMatchObject({ claimed: false, status: "acknowledged" });
		expect(claims).toBe(1);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test("a message is delivered after the write finishes or after the agent confirms it", async () => {
	const home = mkdtempSync("/tmp/trl-ledger-");
	try {
		const path = join(home, "input.json");
		const ledger = new InputLedger(path);
		expect(ledger.delivered("absent")).toBe(false);
		const completion = Promise.withResolvers<void>();
		const pending = ledger.deliver("written", "bytes", () => completion.promise);
		expect(ledger.delivered("written")).toBe(false);
		completion.resolve();
		await pending;
		expect(ledger.delivered("written")).toBe(true);
		expect(new InputLedger(path).delivered("written")).toBe(true);
		ledger.registerNative("native", "digest", () => {});
		expect(ledger.delivered("native")).toBe(false);
		ledger.acknowledge("native");
		expect(ledger.delivered("native")).toBe(true);
		expect(new InputLedger(path).delivered("native")).toBe(true);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
