import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { streamCommand } from "../streamCommand/index.ts";
import { pruneReleases } from "./pruneReleases.ts";

const active = "a".repeat(64);
const installed = "b".repeat(64);
const held = "c".repeat(64);
const stale = "d".repeat(64);

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
	const root = mkdtempSync(join(tmpdir(), "trellis-prune-output-"));
	roots.push(root);
	for (const name of [active, installed, held, stale, ".pending-old", ".pending-new"]) mkdirSync(join(root, name));
	utimesSync(join(root, ".pending-old"), 0, 0);
	return root;
};

test("a release that is neither kept nor named by a live process goes", async () => {
	const root = fixture();
	writeFileSync(join(root, "release.json"), "{}");
	const processText = `/Users/me/Library/Application Support/Trellis/releases/${held}/bin/node runtime --home /Users/me/.trellis TRELLIS_HARNESS_HOOK=/x\n`;
	const removed = await pruneReleases(root, [active, installed], Date.now(), async (_command, _args, receive) => {
		receive(processText);
	});
	expect(removed).toEqual([stale]);
	expect(readdirSync(root).sort()).toEqual([".pending-new", "release.json", active, installed, held].sort());
});

test("a release named only in the environment of a process stays", async () => {
	const root = fixture();
	const processText = `claude --print TRELLIS_HARNESS_HOOK='/Users/me/Library/Application Support/Trellis/releases/${held}/bin/bun hook.ts'\n`;
	const removed = await pruneReleases(root, [], Date.now(), async (_command, _args, receive) => {
		receive(processText);
	});
	expect(removed.sort()).toEqual([active, installed, stale].sort());
	expect(readdirSync(root).sort()).toEqual([".pending-new", held].sort());
});

test("pruning reads past 256 MiB before it removes unused releases", async () => {
	const root = fixture();
	let bytes = 0;
	const removed = await pruneReleases(root, [active, installed], Date.now(), async (command, args, receive) => {
		expect(command).toBe("/bin/ps");
		expect(args).toEqual(["-axwwE", "-o", "command="]);
		await streamCommand(
			process.execPath,
			[
				"-e",
				`
			const { writeSync } = require("node:fs");
			const chunk = "x".repeat(1024 * 1024);
			for (let i = 0; i < 257; i++) writeSync(1, chunk);
			writeSync(1, " TRELLIS_HARNESS_HOOK=/x/releases/${held}/hook\\n");
		`,
			],
			(text) => {
				bytes += Buffer.byteLength(text);
				receive(text);
			},
		);
	});
	expect(bytes).toBeGreaterThan(256 * 1024 * 1024);
	expect(removed).toEqual([stale]);
	expect(readdirSync(root).sort()).toEqual([".pending-new", active, installed, held].sort());
}, 60_000);

test("a release path survives every chunk boundary", async () => {
	const root = fixture();
	await pruneReleases(root, [active, installed], Date.now(), async (_command, _args, receive) => {
		for (const character of `/releases/${held}/releases/${stale}/`) receive(character);
	});
	expect(readdirSync(root)).toContain(held);
	expect(readdirSync(root)).toContain(stale);
});

test("a failed process scan removes no release or pending copy", async () => {
	const root = fixture();
	const before = readdirSync(root);
	await expect(
		pruneReleases(root, [], Date.now(), async (_command, _args, receive) => {
			await streamCommand(process.execPath, ["-e", 'process.stdout.write("partial"); process.exitCode = 7'], receive);
		}),
	).rejects.toThrow("failed (7)");
	expect(readdirSync(root)).toEqual(before);
});
