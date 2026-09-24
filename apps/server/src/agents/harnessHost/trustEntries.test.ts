import { expect, test } from "bun:test";
import { mkdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { tempDirs } from "../../tempDir.ts";
import { trustEntriesToRemove } from "./trustEntries.ts";

const tempDir = tempDirs();

const prefix = `/home/me/.trellis/agents${sep}`;
const gone = new Set(["/home/me/.trellis/agents/OLD/work"]);
const missing = async (directory: string) => gone.has(directory);

test("a key under the agent directory that is gone comes back", async () => {
	const keys = ["/home/me/.trellis/agents/OLD/work", "/home/me/.trellis/agents/LIVE/work"];
	expect(await trustEntriesToRemove(keys, prefix, missing)).toEqual(["/home/me/.trellis/agents/OLD/work"]);
});

test("a key outside the agent directory never comes back", async () => {
	const keys = ["/home/me/projects/site", "/home/me/.trellis/agents-other/OLD/work"];
	expect(await trustEntriesToRemove(keys, prefix, async () => true)).toEqual([]);
});

test("a directory that is gone comes back, and one that exists does not", async () => {
	const home = await realpath(await tempDir("trellis-trust-entries-"));
	const live = join(home, "LIVE", "work");
	await mkdir(live, { recursive: true });
	const keys = [live, join(home, "OLD", "work")];
	expect(await trustEntriesToRemove(keys, `${home}${sep}`)).toEqual([join(home, "OLD", "work")]);
});

test("a stat that fails for another reason stops the removal", async () => {
	const failing = async () => {
		throw Object.assign(new Error("permission denied"), { code: "EACCES" });
	};
	expect(trustEntriesToRemove([`${prefix}OLD/work`], prefix, failing)).rejects.toThrow("permission denied");
});
