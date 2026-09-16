import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcriptDir, usageRoots } from "./roots.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

test("a managed profile that links its projects to the default login shares one root", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-usage-roots-"));
	dirs.push(home);
	await mkdir(join(home, ".claude", "projects"), { recursive: true });
	await mkdir(join(home, "accounts", "work", "profile"), { recursive: true });
	await symlink(join(home, ".claude", "projects"), join(home, "accounts", "work", "profile", "projects"));
	await mkdir(join(home, "codex-home", "sessions"), { recursive: true });
	await mkdir(join(home, ".local", "share", "muse", "sessions"), { recursive: true });
	const roots = await usageRoots(
		[
			{ harness: "claude", profilePath: join(home, "accounts", "work", "profile"), name: "Work", isDefault: true },
			{ harness: "codex", profilePath: join(home, "codex-home"), name: "Codex Work", isDefault: false },
			{ harness: "pi", profilePath: join(home, "missing"), name: "Pi", isDefault: false },
		],
		{ HOME: home },
	);
	expect(roots.map((root) => [root.harness, root.accounts])).toEqual([
		["claude", ["Work"]],
		["codex", ["Codex Work"]],
		["muse", []],
	]);
	expect(roots[0]!.path.endsWith(join(".claude", "projects"))).toBe(true);
});

test("each harness keeps its transcripts in its own directory of the profile", () => {
	expect(transcriptDir("claude", "/p")).toBe("/p/projects");
	expect(transcriptDir("codex", "/p")).toBe("/p/sessions");
	expect(transcriptDir("pi", "/p")).toBe("/p/sessions");
	expect(transcriptDir("opencode", "/p")).toBe("/p/opencode/storage");
	expect(transcriptDir("muse", "/p")).toBe("/p/muse/sessions");
});
