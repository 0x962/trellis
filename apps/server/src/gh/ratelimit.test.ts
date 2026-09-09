import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { intervalMultiplier, readRateLimit } from "./ratelimit.ts";
import { createGhRunner } from "./run.ts";

// `gh api rate_limit` reports one budget per resource. The poller spends
// the graphql budget, and a diff fetch spends the core budget, so the reader
// reports the lower fraction of the two. The poller multiplies its intervals
// by 4 while that fraction is under 20 percent.
const scratch = () => mkdtempSync(join(process.env.TRELLIS_HOME!, "gh-ratelimit-"));
const restores: Array<() => void> = [];
afterEach(() => {
	for (const restore of restores.splice(0)) restore();
});
const stub = (replies: Parameters<typeof ghStub>[1]) => {
	const handle = ghStub(scratch(), replies);
	restores.push(handle.restore);
	return handle;
};

// GitHub.com reports both budgets. A host can report core alone, so the
// reader must accept a body whose resources hold only core.
const budget = JSON.stringify({ resources: { core: { limit: 5000, remaining: 4000, reset: 1757400000 } } });
const resources = {
	core: { limit: 5000, remaining: 4000, reset: 1757400000 },
	graphql: { limit: 5000, remaining: 4500, reset: 1757400300 },
};

describe("readRateLimit", () => {
	test("reads gh api rate_limit and computes the remaining fraction", async () => {
		const handle = stub({
			"auth status": { stdout: "ok", stderr: "", exitCode: 0, delayMs: 300 },
			"api rate_limit": { stdout: budget, stderr: "", exitCode: 0 },
		});
		const runGh = createGhRunner();
		const pollers = [runGh("poller", ["auth", "status"]), runGh("poller", ["auth", "status"])];
		await Bun.sleep(100);
		const reading = readRateLimit(runGh);
		await Bun.sleep(100);
		// Both poller slots are held, so the read has not spawned yet.
		expect(handle.spawns()).toHaveLength(2);
		await Promise.all(pollers);
		const result = await reading;
		expect(result).toMatchObject({
			ok: true,
			resource: "core",
			limit: 5000,
			remaining: 4000,
			// 1757400000 s after the epoch, as an ISO string.
			resetAt: "2025-09-09T06:40:00.000Z",
			fraction: 0.8,
			multiplier: 1,
		});
		const reads = handle.spawns().filter((spawn) => spawn.args[0] === "api");
		expect(reads).toHaveLength(1);
		expect(reads[0]!.args).toEqual(["api", "rate_limit"]);
	});

	test("reports core when the body carries both budgets and core is the lower fraction", async () => {
		stub({ "api rate_limit": { stdout: JSON.stringify({ resources }), stderr: "", exitCode: 0 } });
		expect(await readRateLimit(createGhRunner())).toMatchObject({
			ok: true,
			resource: "core",
			limit: 5000,
			remaining: 4000,
			resetAt: "2025-09-09T06:40:00.000Z",
			fraction: 0.8,
			multiplier: 1,
		});
	});

	test("reports the graphql budget when it is the lower fraction", async () => {
		const graphql = { limit: 5000, remaining: 100, reset: 1757400300 };
		stub({
			"api rate_limit": { stdout: JSON.stringify({ resources: { ...resources, graphql } }), stderr: "", exitCode: 0 },
		});
		expect(await readRateLimit(createGhRunner())).toMatchObject({
			ok: true,
			resource: "graphql",
			limit: 5000,
			remaining: 100,
			resetAt: "2025-09-09T06:45:00.000Z",
			fraction: 0.02,
			multiplier: 4,
		});
	});

	test("returns the run failure when gh cannot read the rate limit", async () => {
		stub({
			"api rate_limit": {
				stdout: "",
				stderr: "To get started with GitHub CLI, please run: gh auth login",
				exitCode: 1,
			},
		});
		const result = await readRateLimit(createGhRunner());
		expect(result).toMatchObject({ ok: false, reason: "unauthenticated" });
		expect(result).not.toHaveProperty("remaining");
		expect(result).not.toHaveProperty("multiplier");
	});
});

describe("intervalMultiplier", () => {
	test("multiplier is 4 under 20 percent remaining", () => {
		expect(intervalMultiplier(999 / 5000)).toBe(4);
	});

	test("multiplier is 1 at and above 20 percent remaining", () => {
		expect(intervalMultiplier(1000 / 5000)).toBe(1);
		expect(intervalMultiplier(5000 / 5000)).toBe(1);
	});
});
