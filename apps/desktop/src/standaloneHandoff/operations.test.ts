import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handoffOperations } from "./operations.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const resources = (source: string) => {
	const root = mkdtempSync(join(tmpdir(), "trellis-handoff-output-"));
	roots.push(root);
	mkdirSync(join(root, "bin"));
	mkdirSync(join(root, "apps/server/src/standaloneHandoff"), { recursive: true });
	symlinkSync(process.execPath, join(root, "bin/bun"));
	writeFileSync(join(root, "apps/server/src/standaloneHandoff/entry.ts"), source);
	return root;
};
const candidate = { home: "/fixture", backupPath: "/fixture/backup", service: null };

test("handoff preserves the full JSON and drains large stderr", async () => {
	const root = resources(`
		const { writeSync } = require("node:fs");
		writeSync(2, "diagnostic".repeat(600_000));
		writeSync(1, JSON.stringify({
			home: "/fixture", backupPath: "/fixture/backup", automationPaused: true,
			restoreCommands: [{ command: "restore", args: ["x".repeat(5 * 1024 * 1024), "終わり"] }]
		}));
	`);
	const result = await handoffOperations.prepare(root, candidate);
	expect(result.home).toBe(candidate.home);
	expect(result.restoreCommands[0]?.args).toEqual(["x".repeat(5 * 1024 * 1024), "終わり"]);
});

test("a failed handoff rejects valid JSON and preserves the end of stderr", async () => {
	const root = resources(`
		const { writeSync } = require("node:fs");
		writeSync(1, JSON.stringify({ home: "/fixture" }));
		writeSync(2, "x".repeat(5 * 1024 * 1024) + "FINAL FAILURE");
		process.exitCode = 7;
	`);
	await expect(handoffOperations.prepare(root, candidate)).rejects.toThrow("FINAL FAILURE");
});

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
