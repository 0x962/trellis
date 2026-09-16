import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeTrust } from "./claudeTrust.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});

const setup = async () => {
	const home = await mkdtemp("/tmp/trellis-claude-trust-");
	homes.push(home);
	const cwd = join(home, "work");
	await mkdir(cwd);
	return { home, cwd };
};

test("a fresh profile gets the trust entry and the completed first-run setup", async () => {
	const { home, cwd } = await setup();
	const profile = join(home, "profile");
	await mkdir(profile);
	await claudeTrust(cwd, { HOME: home, CLAUDE_CONFIG_DIR: profile });
	const state = JSON.parse(await readFile(join(profile, ".claude.json"), "utf8"));
	expect(state.hasCompletedOnboarding).toBe(true);
	expect(state.projects[cwd].hasTrustDialogAccepted).toBe(true);
});

test("the default profile writes ~/.claude.json and keeps the rest of the state", async () => {
	const { home, cwd } = await setup();
	const statePath = join(home, ".claude.json");
	await writeFile(statePath, JSON.stringify({ theme: "dark", projects: { "/elsewhere": { allowedTools: [] } } }));
	await claudeTrust(cwd, { HOME: home });
	const state = JSON.parse(await readFile(statePath, "utf8"));
	expect(state.theme).toBe("dark");
	expect(state.hasCompletedOnboarding).toBe(true);
	expect(state.projects["/elsewhere"]).toEqual({ allowedTools: [] });
	expect(state.projects[cwd].hasTrustDialogAccepted).toBe(true);
});

test("a trusted directory in an onboarded profile leaves the file alone", async () => {
	const { home, cwd } = await setup();
	const statePath = join(home, ".claude.json");
	const original = JSON.stringify({
		hasCompletedOnboarding: true,
		projects: { [cwd]: { hasTrustDialogAccepted: true } },
	});
	await writeFile(statePath, original);
	await claudeTrust(cwd, { HOME: home });
	expect(await readFile(statePath, "utf8")).toBe(original);
});
