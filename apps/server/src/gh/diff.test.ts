import { expect, test } from "bun:test";
import { DIFF_PAGE_BYTES, diffPage, fetchDiff } from "./diff.ts";
import type { GhRunner } from "./run.ts";

test("fetchDiff retains a patch above one MiB", async () => {
	const patch = `first-file\n${"a".repeat(DIFF_PAGE_BYTES)}\nsecond-file\n`;
	const run = Object.assign(async () => ({ ok: true as const, code: 0, stdout: patch, stderr: "" }), {
		bin: "gh",
		timeoutMs: 30_000,
	}) satisfies GhRunner;

	expect(await fetchDiff(run, "https://github.com/acme/app/pull/1")).toEqual({ ok: true, diff: patch });
});

test("diffPage keeps a multibyte hunk intact across pages", () => {
	const before = "a".repeat(DIFF_PAGE_BYTES - 1);
	const patch = `${before}€\nsecond-file\n`;
	const bytes = new TextEncoder().encode(patch);
	const first = diffPage(bytes, 0);
	const second = diffPage(bytes, first.nextCursor!);

	expect(first.diff).toBe(before);
	expect(first.nextCursor).toBe(DIFF_PAGE_BYTES - 1);
	expect(second.diff).toBe("€\nsecond-file\n");
	expect(second.nextCursor).toBeNull();
	expect(first.diff + second.diff).toBe(patch);
});
