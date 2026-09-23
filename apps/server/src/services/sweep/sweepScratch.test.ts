import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCRATCH_MIN_AGE_MS, sweepScratch } from "./sweepScratch.ts";

// The sweep runs against this root, never against the temporary directory
// of the person.
let root: string;
const now = new Date("2026-09-23T12:00:00Z").getTime();
const old = new Date(now - SCRATCH_MIN_AGE_MS - 60_000);
const recent = new Date(now - 60_000);

// `utimes` on a file leaves the time of its directory alone, so each path
// takes its own time, deepest first.
const age = async (paths: string[], at: Date) => {
	for (const path of paths) await utimes(path, at, at);
};

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "trellis-scratch-sweep-test-"));
	for (const name of ["trellis-stale", "trellis-open", "trellis-open-real", "trellis-busy", "other-tool"]) {
		await mkdir(join(root, name, "repo"), { recursive: true });
		await writeFile(join(root, name, "repo", "big.bin"), "a".repeat(1000));
		await writeFile(join(root, name, "note.txt"), "b".repeat(24));
	}
	const paths = (name: string) => [
		join(root, name, "repo", "big.bin"),
		join(root, name, "note.txt"),
		join(root, name, "repo"),
		join(root, name),
	];
	for (const name of ["trellis-stale", "trellis-open", "trellis-open-real", "other-tool"]) await age(paths(name), old);
	// The top directory is old and one file deep inside is new, which is what
	// a build that still writes looks like.
	await age(paths("trellis-busy"), old);
	await age([join(root, "trellis-busy", "repo", "big.bin")], recent);
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

test("the sweep removes a stale scratch directory and counts its bytes", async () => {
	const held = [
		join(root, "trellis-open", "repo", ".git", "index"),
		join(await realpath(root), "trellis-open-real", "repo"),
	];
	const result = await sweepScratch(root, now, held);
	expect(result).toEqual({ removedScratch: 1, removedScratchBytes: 1024 });
	expect(existsSync(join(root, "trellis-stale"))).toBe(false);
	// A process holds the first two, the third still writes, and the fourth
	// belongs to another program.
	expect(existsSync(join(root, "trellis-open"))).toBe(true);
	expect(existsSync(join(root, "trellis-open-real"))).toBe(true);
	expect(existsSync(join(root, "trellis-busy"))).toBe(true);
	expect(existsSync(join(root, "other-tool"))).toBe(true);
});

test("the directory of an exited process goes at the next sweep", async () => {
	const result = await sweepScratch(root, now, []);
	expect(result).toEqual({ removedScratch: 2, removedScratchBytes: 2048 });
	expect(existsSync(join(root, "trellis-open"))).toBe(false);
	expect(existsSync(join(root, "trellis-open-real"))).toBe(false);
	expect(existsSync(join(root, "trellis-busy"))).toBe(true);
});
