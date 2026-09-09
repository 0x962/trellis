import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { createGhRunner } from "./run.ts";

// One gh binary serves the process, so the slots are shared by every runner:
// 2 poller slots and 1 interactive slot. A call past its slot count waits.
// The stub logs a spawn at its start, so the log shows which calls run.
const scratch = () => mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-slots-"));
const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Parameters<typeof ghStub>[1]) => {
	const handle = ghStub(scratch(), replies);
	restores.push(handle.restore);
	return handle;
};

const slow = { "auth status": { stdout: "ok", stderr: "", exitCode: 0, delayMs: 300 } };
const settleCounter = (promises: Promise<unknown>[]) => {
	let settled = 0;
	for (const promise of promises) promise.then(() => settled++);
	return () => settled;
};

describe("gh slots", () => {
	test("a third poller call waits for one of the 2 poller slots", async () => {
		const handle = stub(slow);
		const runGh = createGhRunner();
		const first = runGh("poller", ["auth", "status"]);
		const second = runGh("poller", ["auth", "status"]);
		await Bun.sleep(100);
		expect(handle.spawns()).toHaveLength(2);
		const third = runGh("poller", ["auth", "status"]);
		await Bun.sleep(100);
		expect(handle.spawns()).toHaveLength(2);
		await Promise.all([first, second, third]);
		const spawns = handle.spawns();
		expect(spawns).toHaveLength(3);
		const firstStart = Math.min(spawns[0]!.at, spawns[1]!.at);
		expect(spawns[2]!.at - firstStart).toBeGreaterThanOrEqual(280);
	});

	test("an interactive call runs at once while both poller slots are busy", async () => {
		const handle = stub(slow);
		const runGh = createGhRunner();
		const pollers = [runGh("poller", ["auth", "status"]), runGh("poller", ["auth", "status"])];
		const settled = settleCounter(pollers);
		await Bun.sleep(100);
		const interactive = runGh("interactive", ["auth", "status"]);
		await Bun.sleep(100);
		expect(handle.spawns()).toHaveLength(3);
		expect(settled()).toBe(0);
		await Promise.all([...pollers, interactive]);
	});

	test("a second interactive call waits for the single interactive slot", async () => {
		const handle = stub(slow);
		const runGh = createGhRunner();
		const first = runGh("interactive", ["auth", "status"]);
		await Bun.sleep(100);
		const second = runGh("interactive", ["auth", "status"]);
		await Bun.sleep(100);
		expect(handle.spawns()).toHaveLength(1);
		await Promise.all([first, second]);
		const spawns = handle.spawns();
		expect(spawns).toHaveLength(2);
		expect(spawns[1]!.at - spawns[0]!.at).toBeGreaterThanOrEqual(280);
	});

	test("a poller call does not wait on the interactive slot", async () => {
		const handle = stub(slow);
		const runGh = createGhRunner();
		const interactive = runGh("interactive", ["auth", "status"]);
		const settled = settleCounter([interactive]);
		await Bun.sleep(100);
		const poller = runGh("poller", ["auth", "status"]);
		await Bun.sleep(100);
		expect(handle.spawns()).toHaveLength(2);
		expect(settled()).toBe(0);
		await Promise.all([interactive, poller]);
	});

	test("a failed or timed-out call releases its slot", async () => {
		stub({
			"auth status": { stdout: "late", stderr: "", exitCode: 0, delayMs: 5000 },
			"api graphql": { stdout: "{}", stderr: "", exitCode: 0 },
		});
		const stubBin = process.env.TRELLIS_GH_BIN!;
		process.env.TRELLIS_GH_BIN = join(scratch(), "missing-gh");
		const missing = createGhRunner();
		process.env.TRELLIS_GH_BIN = stubBin;
		expect(await missing("poller", ["auth", "status"])).toMatchObject({ ok: false, reason: "missing" });
		const timedOut = await createGhRunner({ timeoutMs: 100 })("poller", ["auth", "status"]);
		expect(timedOut).toMatchObject({ ok: false, reason: "error" });
		const third = createGhRunner()("poller", ["api", "graphql"]);
		const outcome = await Promise.race([third, Bun.sleep(1000).then(() => "stuck")]);
		expect(outcome).toEqual({ ok: true, code: 0, stdout: "{}", stderr: "" });
	});

	// Two failures of one kind fill both poller slots when that path leaks its
	// slot, so a third call then never runs. One failure per kind cannot show
	// this, because the other slot stays free.
	test("two missing-binary calls release both poller slots", async () => {
		stub({ "api graphql": { stdout: "{}", stderr: "", exitCode: 0 } });
		const stubBin = process.env.TRELLIS_GH_BIN!;
		process.env.TRELLIS_GH_BIN = join(scratch(), "missing-gh");
		const missing = createGhRunner();
		process.env.TRELLIS_GH_BIN = stubBin;
		for (let i = 0; i < 2; i++) {
			expect(await missing("poller", ["auth", "status"])).toMatchObject({ ok: false, reason: "missing" });
		}
		const third = createGhRunner()("poller", ["api", "graphql"]);
		const outcome = await Promise.race([third, Bun.sleep(1000).then(() => "stuck")]);
		expect(outcome).toEqual({ ok: true, code: 0, stdout: "{}", stderr: "" });
	});

	test("two timed-out calls release both poller slots", async () => {
		stub({
			"auth status": { stdout: "late", stderr: "", exitCode: 0, delayMs: 5000 },
			"api graphql": { stdout: "{}", stderr: "", exitCode: 0 },
		});
		const short = createGhRunner({ timeoutMs: 100 });
		for (let i = 0; i < 2; i++) {
			expect(await short("poller", ["auth", "status"])).toMatchObject({ ok: false, reason: "error", code: null });
		}
		const third = createGhRunner()("poller", ["api", "graphql"]);
		const outcome = await Promise.race([third, Bun.sleep(1000).then(() => "stuck")]);
		expect(outcome).toEqual({ ok: true, code: 0, stdout: "{}", stderr: "" });
	});
});
