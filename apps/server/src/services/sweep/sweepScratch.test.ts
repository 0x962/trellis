import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCRATCH_MIN_AGE_MS, sweepScratch } from "./sweepScratch.ts";

// The sweep runs against these roots, never against the temporary directory
// of the person.
let root: string;
// One directory that loses some of its files and keeps the rest. It sits in
// a root of its own, so the counts of the sweeps above stay the same.
let partialRoot: string;
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
	for (const name of [
		"trellis-stale",
		"trellis-open",
		"trellis-open-real",
		"trellis-busy",
		"trellis-no-write",
		"trellis-testdb",
		"other-tool",
	]) {
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
	for (const name of [
		"trellis-stale",
		"trellis-open",
		"trellis-open-real",
		"trellis-no-write",
		"trellis-testdb",
		"other-tool",
	])
		await age(paths(name), old);
	// The top directory is old and one file deep inside is new, which is what
	// a build that still writes looks like.
	await age(paths("trellis-busy"), old);
	await age([join(root, "trellis-busy", "repo", "big.bin")], recent);

	partialRoot = await mkdtemp(join(tmpdir(), "trellis-scratch-partial-test-"));
	const partial = join(partialRoot, "trellis-partial");
	await mkdir(join(partial, "repo"), { recursive: true });
	await writeFile(join(partial, "repo", "big.bin"), "a".repeat(1000));
	await writeFile(join(partial, "note.txt"), "b".repeat(24));
	await age([join(partial, "repo", "big.bin"), join(partial, "note.txt"), join(partial, "repo"), partial], old);
});

afterAll(async () => {
	// The test takes the write permission off trellis-no-write, so a delete of
	// the files inside it fails. Put the permission back, or the delete of root
	// fails too.
	await chmod(join(root, "trellis-no-write"), 0o700);
	await rm(root, { recursive: true, force: true });
	await chmod(join(partialRoot, "trellis-partial", "repo"), 0o700);
	await rm(partialRoot, { recursive: true, force: true });
});

test("the sweep removes a stale scratch directory and counts its bytes", async () => {
	const held = [
		join(root, "trellis-open", "repo", ".git", "index"),
		join(await realpath(root), "trellis-open-real", "repo"),
	];
	// trellis-no-write denies write permission, so the sweep cannot delete the
	// files inside it. The sweep must still reach the names that come after it.
	await chmod(join(root, "trellis-no-write"), 0o500);
	const result = await sweepScratch(root, now, held);
	expect({ removedScratch: result.removedScratch, removedScratchBytes: result.removedScratchBytes }).toEqual({
		removedScratch: 1,
		removedScratchBytes: 1024,
	});
	expect(existsSync(join(root, "trellis-stale"))).toBe(false);
	// A process holds the first two, the third still writes, and the fourth
	// belongs to another program.
	expect(existsSync(join(root, "trellis-open"))).toBe(true);
	expect(existsSync(join(root, "trellis-open-real"))).toBe(true);
	expect(existsSync(join(root, "trellis-busy"))).toBe(true);
	expect(existsSync(join(root, "other-tool"))).toBe(true);
	// apps/server/src/db/testDb.ts owns this name and runs its own rule.
	expect(existsSync(join(root, "trellis-testdb"))).toBe(true);
});

test("the directory of an exited process goes at the next sweep", async () => {
	const result = await sweepScratch(root, now, []);
	expect({ removedScratch: result.removedScratch, removedScratchBytes: result.removedScratchBytes }).toEqual({
		removedScratch: 2,
		removedScratchBytes: 2048,
	});
	expect(existsSync(join(root, "trellis-open"))).toBe(false);
	expect(existsSync(join(root, "trellis-open-real"))).toBe(false);
	expect(existsSync(join(root, "trellis-busy"))).toBe(true);
});

test("the sweep names the directory it cannot remove and does not count it", async () => {
	const result = await sweepScratch(root, now, []);
	expect(result.errors).toHaveLength(1);
	expect(result.errors[0]).toContain(join(root, "trellis-no-write"));
	expect(result.removedScratch).toBe(0);
	expect(existsSync(join(root, "trellis-no-write"))).toBe(true);
});

test("the sweep counts the bytes that a part of a removal gave back", async () => {
	// `rm` removes every file it reaches and stops at `repo`, so `note.txt`
	// goes and `big.bin` stays.
	await chmod(join(partialRoot, "trellis-partial", "repo"), 0o500);
	const result = await sweepScratch(partialRoot, now, []);
	expect(result.errors).toHaveLength(1);
	expect(result.removedScratch).toBe(0);
	expect(result.removedScratchBytes).toBe(24);
	expect(existsSync(join(partialRoot, "trellis-partial", "note.txt"))).toBe(false);
	expect(existsSync(join(partialRoot, "trellis-partial", "repo", "big.bin"))).toBe(true);
});
