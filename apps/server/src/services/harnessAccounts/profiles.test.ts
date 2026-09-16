import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { profileEnvironment, provisionProfile } from "./profiles.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
test.each(["claude", "codex", "pi", "opencode", "muse"] as const)(
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
			META_API_KEY: "other",
		};
		const result = await profileEnvironment({ harness, profilePath }, env);
		const variable = {
			claude: "CLAUDE_CONFIG_DIR",
			codex: "CODEX_HOME",
			pi: "PI_CODING_AGENT_DIR",
			opencode: "XDG_DATA_HOME",
			muse: "XDG_DATA_HOME",
		}[harness];
		expect(result[variable]).toBe(profilePath);
		if (harness === "muse") {
			expect(result.XDG_CONFIG_HOME).toBe(profilePath);
			expect(result.META_API_KEY).toBeUndefined();
		}
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

test("a managed Muse profile links the shared sessions and copies the settings of the default login", async () => {
	const home = await mkdtemp("/tmp/trellis-profile-env-");
	homes.push(home);
	const data = join(home, "share"),
		config = join(home, "config");
	await mkdir(join(data, "muse", "sessions"), { recursive: true });
	await mkdir(join(config, "muse"), { recursive: true });
	await writeFile(join(config, "muse", "settings.json"), '{"model":"muse-spark-1.3"}');
	await writeFile(join(config, "muse", "auth.json"), "secret");
	const profile = await provisionProfile(
		home,
		"one",
		{ harness: "muse", name: "Work" },
		{ HOME: home, XDG_DATA_HOME: data, XDG_CONFIG_HOME: config },
	);
	expect(profile).toBe(join(home, "accounts", "one", "profile"));
	expect(await realpath(join(profile, "muse", "sessions"))).toBe(await realpath(join(data, "muse", "sessions")));
	expect(await readFile(join(profile, "muse", "settings.json"), "utf8")).toBe('{"model":"muse-spark-1.3"}');
	expect(existsSync(join(profile, "muse", "auth.json"))).toBe(false);
});
