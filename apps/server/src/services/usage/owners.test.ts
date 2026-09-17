import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeSessionOwners, claudeStatePath } from "./owners.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

test("the default profile keeps its state next door, a custom profile keeps it inside", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-usage-owners-"));
	dirs.push(home);
	await mkdir(join(home, ".claude"), { recursive: true });
	await mkdir(join(home, "work"), { recursive: true });
	expect(await claudeStatePath(join(home, ".claude"), { HOME: home })).toBe(join(home, ".claude.json"));
	expect(await claudeStatePath(join(home, "work"), { HOME: home })).toBe(join(home, "work", ".claude.json"));
});

test("each Claude profile names the last session of every directory it worked in", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-usage-owners-"));
	dirs.push(home);
	await mkdir(join(home, ".claude"), { recursive: true });
	await mkdir(join(home, "work"), { recursive: true });
	await writeFile(
		join(home, ".claude.json"),
		JSON.stringify({ projects: { "/repo": { lastSessionId: "s-1" }, "/other": { lastSessionId: "s-2" } } }),
	);
	await writeFile(
		join(home, "work", ".claude.json"),
		JSON.stringify({ projects: { "/repo": { lastSessionId: "s-3" } } }),
	);
	const owners = await claudeSessionOwners(
		[
			{ harness: "claude", profilePath: join(home, ".claude"), name: "Dev", isDefault: true },
			{ harness: "claude", profilePath: join(home, "work"), name: "Work", isDefault: false },
			{ harness: "codex", profilePath: join(home, "codex"), name: "Codex", isDefault: true },
		],
		{ HOME: home },
	);
	expect([...owners.entries()]).toEqual([
		["s-1", "Dev"],
		["s-2", "Dev"],
		["s-3", "Work"],
	]);
});
