import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readHostDefault, resolveHostDefault, writeHostDefault } from "./hostDefault.ts";

const dirs: string[] = [];
afterEach(async () => {
	for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const scratch = async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-host-default-"));
	dirs.push(home);
	await mkdir(join(home, ".claude"), { recursive: true });
	await mkdir(join(home, "work"), { recursive: true });
	await mkdir(join(home, ".superset", "state"), { recursive: true });
	return home;
};
const account = (name: string, profilePath: string, isDefault: boolean) => ({
	id: name,
	name,
	harness: "claude" as const,
	profilePath,
	isDefault,
});

test("the SuperSet pointer wins over the Trellis flag, and an empty pointer means the plain login", async () => {
	const home = await scratch();
	const env = { HOME: home };
	const accounts = [account("Dev", join(home, ".claude"), true), account("Work", join(home, "work"), false)];
	await writeFile(join(home, ".superset", "state", "default-claude-config-dir"), join(home, "work"));
	expect(await resolveHostDefault("claude", accounts, env)).toMatchObject({
		account: { name: "Work" },
		source: "superset",
	});
	await writeFile(join(home, ".superset", "state", "default-claude-config-dir"), "");
	expect(await resolveHostDefault("claude", accounts, env)).toMatchObject({
		account: { name: "Dev" },
		source: "superset",
	});
});

test("without a pointer the Trellis flag wins, and without a flag the plain login is the default", async () => {
	const home = await scratch();
	const env = { HOME: home };
	const flagged = [account("Dev", join(home, ".claude"), false), account("Work", join(home, "work"), true)];
	expect(await resolveHostDefault("claude", flagged, env)).toMatchObject({
		account: { name: "Work" },
		source: "trellis",
	});
	const none = [account("Dev", join(home, ".claude"), false), account("Work", join(home, "work"), false)];
	expect(await resolveHostDefault("claude", none, env)).toMatchObject({
		profilePath: join(home, ".claude"),
		account: { name: "Dev" },
		source: "system",
	});
	expect(await resolveHostDefault("claude", [], env)).toMatchObject({ account: null, source: "system" });
});

test("a pointer whose directory is gone counts as the plain login", async () => {
	const home = await scratch();
	await writeFile(join(home, ".superset", "state", "default-claude-config-dir"), join(home, "gone"));
	expect(await readHostDefault("claude", { HOME: home })).toEqual({ exists: true, profilePath: null });
	expect(await readHostDefault("pi", { HOME: home })).toEqual({ exists: false, profilePath: null });
});

test("a default picked in Trellis writes the pointer where SuperSet keeps it, and never without SuperSet", async () => {
	const home = await scratch();
	await writeHostDefault("claude", join(home, "work"), { HOME: home });
	expect(await readFile(join(home, ".superset", "state", "default-claude-config-dir"), "utf8")).toBe(
		join(home, "work"),
	);
	await writeHostDefault("codex", null, { HOME: home });
	expect(await readFile(join(home, ".superset", "state", "default-codex-home"), "utf8")).toBe("");
	const bare = await mkdtemp(join(tmpdir(), "trellis-host-default-"));
	dirs.push(bare);
	await writeHostDefault("claude", join(home, "work"), { HOME: bare });
	expect(await readHostDefault("claude", { HOME: bare })).toEqual({ exists: false, profilePath: null });
});
