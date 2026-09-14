import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTestApp, type TestApp } from "../../../helpers/app.ts";
import { assertStatusInvariant } from "../../../invariants.ts";

let t: TestApp;
afterEach(async () => {
	await t.serverTx(assertStatusInvariant);
	await t.close();
});

test("diagnostics inspect a stopped runtime without starting it", async () => {
	t = await createTestApp();
	const report = await t.client.system.doctor({});
	expect(report.runtime).toMatchObject({ state: "stopped", pid: null, error: null });
	expect(report.host.home).toBe(t.home);
	expect(report.queue).toEqual({ pending: 0, sending: 0, unknown: 0, oldestDueAt: null });
	expect(report.unresolvedAttempts).toEqual([]);
	expect(existsSync(join(t.home, "runtime", "runtime.sock"))).toBe(false);
	expect(JSON.stringify(report)).not.toMatch(/token|authorization|transcript/i);
});
