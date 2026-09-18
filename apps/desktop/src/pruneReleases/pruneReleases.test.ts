import { expect, test } from "bun:test";
import { releasesToRemove } from "./pruneReleases.ts";

const active = "a".repeat(64);
const installed = "b".repeat(64);
const held = "c".repeat(64);
const stale = "d".repeat(64);

test("a release that is neither kept nor named by a live process goes", () => {
	const processText = `/Users/me/Library/Application Support/Trellis/releases/${held}/bin/node runtime --home /Users/me/.trellis TRELLIS_HARNESS_HOOK=/x\n`;
	expect(
		releasesToRemove(
			[active, installed, held, stale, ".pending-abc", "release.json"],
			new Set([active, installed]),
			processText,
		),
	).toEqual([stale]);
});

test("a release named only in the environment of a process stays", () => {
	const processText = `claude --print TRELLIS_HARNESS_HOOK='/Users/me/Library/Application Support/Trellis/releases/${held}/bin/bun hook.ts'\n`;
	expect(releasesToRemove([held, stale], new Set(), processText)).toEqual([stale]);
});
