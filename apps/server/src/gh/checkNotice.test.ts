import { describe, expect, test } from "bun:test";
import type { Check, CheckBucket } from "@trellis/api";
import { decideNotice, type NoticeSubject, SETTLE_MS, STUCK_MS, type StoredNotice } from "./checkNotice.ts";
import { deriveCiState } from "./parse.ts";

const changedAt = "2026-09-21T10:00:00.000Z";
const changedMs = Date.parse(changedAt);

const check = (name: string, bucket: CheckBucket): Check => ({
	name,
	workflow: "CI",
	bucket,
	link: `https://github.com/o/r/actions/runs/1/job/${name.length}`,
	startedAt: null,
	endedAt: null,
});

const subject = (checks: Check[], headSha = "aaa1111"): NoticeSubject => ({
	state: "open",
	headSha,
	ciState: deriveCiState(checks),
	checks,
	checksChangedAt: changedAt,
});

const failed = (headSha: string, ...names: string[]): StoredNotice => ({
	headSha,
	kind: "failed",
	checks: names.map((name) => ({ name, workflow: "CI", link: null, lines: [] })),
});

describe("decideNotice", () => {
	test("a failure with no pending check sends at once and names every failed check", () => {
		const decision = decideNotice(
			subject([check("lint", "fail"), check("test", "cancel"), check("build", "pass")]),
			[],
			changedMs,
		);
		expect(decision?.kind).toBe("failed");
		expect(decision?.checks.map((entry) => entry.name)).toEqual(["lint", "test"]);
	});

	test("a failure waits while other checks run, until the checks stay quiet for the settle time", () => {
		const burst = subject([check("lint", "fail"), check("test", "pending")]);
		expect(decideNotice(burst, [], changedMs + SETTLE_MS - 1)).toBeNull();
		expect(decideNotice(burst, [], changedMs + SETTLE_MS)?.kind).toBe("failed");
	});

	test("a failure that a notice on this head named sends nothing again", () => {
		const red = subject([check("lint", "fail")]);
		expect(decideNotice(red, [failed("aaa1111", "lint")], changedMs + STUCK_MS)).toBeNull();
	});

	test("a new failure on the same head sends a notice that names every failed check", () => {
		const red = subject([check("lint", "fail"), check("test", "fail")]);
		const decision = decideNotice(red, [failed("aaa1111", "lint")], changedMs);
		expect(decision?.checks.map((entry) => entry.name)).toEqual(["lint", "test"]);
	});

	test("a new head commit resets the failures the agent heard about", () => {
		const red = subject([check("lint", "fail")], "bbb2222");
		expect(decideNotice(red, [failed("aaa1111", "lint")], changedMs)?.kind).toBe("failed");
	});

	test("green after a failure sends passed once, also on a new head commit", () => {
		const green = subject([check("lint", "pass"), check("docs", "skipping")], "bbb2222");
		const told = [failed("aaa1111", "lint")];
		expect(decideNotice(green, told, changedMs)).toEqual({ kind: "passed", checks: [] });
		const afterPassed: StoredNotice[] = [...told, { headSha: "bbb2222", kind: "passed", checks: [] }];
		expect(decideNotice(green, afterPassed, changedMs)).toBeNull();
	});

	test("green with no failure before it sends nothing", () => {
		expect(decideNotice(subject([check("lint", "pass")]), [], changedMs)).toBeNull();
	});

	test("a check that stays pending past the bound sends stuck once per head and pending set", () => {
		const slow = subject([check("e2e", "pending"), check("lint", "pass")]);
		expect(decideNotice(slow, [], changedMs + STUCK_MS - 1)).toBeNull();
		const decision = decideNotice(slow, [], changedMs + STUCK_MS);
		expect(decision?.kind).toBe("stuck");
		expect(decision?.checks.map((entry) => entry.name)).toEqual(["e2e"]);
		const told: StoredNotice = { headSha: "aaa1111", kind: "stuck", checks: decision!.checks };
		expect(decideNotice(slow, [told], changedMs + 2 * STUCK_MS)).toBeNull();
	});

	test("a merged or closed pull request sends nothing", () => {
		expect(decideNotice({ ...subject([check("lint", "fail")]), state: "merged" }, [], changedMs)).toBeNull();
		expect(decideNotice({ ...subject([check("lint", "fail")]), state: "closed" }, [], changedMs)).toBeNull();
	});

	test("a row that no write changed since the detector exists sends nothing", () => {
		expect(decideNotice({ ...subject([check("lint", "fail")]), checksChangedAt: null }, [], changedMs)).toBeNull();
	});
});
