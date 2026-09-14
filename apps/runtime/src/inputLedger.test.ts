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
