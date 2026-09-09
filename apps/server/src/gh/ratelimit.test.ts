import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { ghStub } from "../../test/helpers/gh-stub.ts";
import { intervalMultiplier, readRateLimit } from "./ratelimit.ts";
import { createGhRunner } from "./run.ts";

// `gh api rate_limit` reports the core budget. The poller multiplies its
// intervals by 4 while the remaining fraction is under 20 percent.
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

const budget = JSON.stringify({ resources: { core: { limit: 5000, remaining: 4000, reset: 1757400000 } } });

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
