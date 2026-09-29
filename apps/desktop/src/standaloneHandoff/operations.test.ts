import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { handoffOperations } from "./operations.ts";

test("waits for a standalone process that exits after ten seconds", async () => {
	const child = spawn("/bin/sleep", ["10.2"], { stdio: "ignore" });
	const exited = once(child, "close");
	try {
		await handoffOperations.waitForExit(child.pid!);
		expect(await exited).toEqual([0, null]);
		expect(handoffOperations.alive(child.pid!)).toBe(false);
	} finally {
		child.kill();
		await exited;
	}
}, 30_000);
