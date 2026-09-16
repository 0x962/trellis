import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { profileEnvironment, provisionProfile } from "./profiles.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
test.each(["claude", "codex", "pi", "opencode"] as const)(
	"%s isolates its selected profile from inherited login overrides",
	async (harness) => {
		const profilePath = await mkdtemp("/tmp/trellis-profile-env-");
		homes.push(profilePath);
		const env = {
			PATH: "/usr/bin",
			HOME: profilePath,
			OPENAI_API_KEY: "other",
			ANTHROPIC_API_KEY: "other",
			ANTHROPIC_AUTH_TOKEN: "other",
			CLAUDE_CODE_OAUTH_TOKEN: "other",
			OPENCODE_AUTH_JSON: '{"provider":"other"}',
		};
		const result = await profileEnvironment({ harness, profilePath }, env);
		const variable = {
			claude: "CLAUDE_CONFIG_DIR",
			codex: "CODEX_HOME",
			pi: "PI_CODING_AGENT_DIR",
			opencode: "XDG_DATA_HOME",
		}[harness];
		expect(result[variable]).toBe(profilePath);
		expect(result.PATH).toBe("/usr/bin");
		if (harness !== "codex") expect(result.ANTHROPIC_API_KEY).toBeUndefined();
		if (harness !== "claude") expect(result.OPENAI_API_KEY).toBeUndefined();
		if (harness === "opencode") expect(result.OPENCODE_AUTH_JSON).toBeUndefined();
		expect(env.OPENAI_API_KEY).toBe("other");
	},
);
test("existing profiles retain their literal directory for credential keychain lookup", async () => {
	const home = await mkdtemp("/tmp/trellis-profile-env-");
	homes.push(home);
	const profile = join(home, "profile"),
		alias = join(home, "alias");
	await mkdir(profile);
	await symlink(profile, alias);
	expect(await provisionProfile(home, "one", { harness: "claude", name: "Work", profilePath: alias }, {})).toBe(alias);
	await expect(
		provisionProfile(home, "two", { harness: "claude", name: "Missing", profilePath: join(home, "missing") }, {}),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
});

test("the default Claude directory leaves CLAUDE_CONFIG_DIR unset, and an alias of it counts as the default", async () => {
	const home = await mkdtemp("/tmp/trellis-profile-env-");
	homes.push(home);
	const defaultDirectory = join(home, ".claude");
	await mkdir(defaultDirectory);
	const alias = join(home, "alias");
	await symlink(defaultDirectory, alias);
	const env = { HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude-other") };
	for (const profilePath of [defaultDirectory, alias]) {
		const result = await profileEnvironment({ harness: "claude", profilePath }, env);
		expect(result.CLAUDE_CONFIG_DIR).toBeUndefined();
	}
	const other = join(home, "other");
	await mkdir(other);
	expect((await profileEnvironment({ harness: "claude", profilePath: other }, env)).CLAUDE_CONFIG_DIR).toBe(other);
});
