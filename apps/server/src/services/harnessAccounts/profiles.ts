import { existsSync } from "node:fs";
import { cp, mkdir, realpath, stat, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { AccountHarness, HarnessAccountCreate } from "@trellis/api";
import { invalidInput } from "../../errors.ts";

export const profileDefault = (harness: AccountHarness, env: NodeJS.ProcessEnv) => {
	const home = env.HOME ?? homedir();
	if (harness === "claude") return env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
	if (harness === "codex") return env.CODEX_HOME ?? join(home, ".codex");
	if (harness === "pi") return env.PI_CODING_AGENT_DIR ?? join(home, ".pi", "agent");
	return env.XDG_DATA_HOME ?? join(home, ".local", "share");
};
const sharedEntries = {
	claude: ["projects", "sessions", "file-history", "todos", "tasks", "plans", "skills", "commands", "plugins"],
	codex: ["sessions", "archived_sessions", "shell_snapshots", "skills", "prompts"],
	pi: ["sessions", "skills", "extensions", "prompts"],
	opencode: [],
};
const configFiles = { claude: ["CLAUDE.md"], codex: ["AGENTS.md"], pi: [], opencode: [] };
export async function provisionProfile(home: string, id: string, input: HarnessAccountCreate, env: NodeJS.ProcessEnv) {
	if (input.profilePath) {
		if (!isAbsolute(input.profilePath)) throw invalidInput("profilePath", "Enter an absolute profile directory.");
		const path = await realpath(input.profilePath).catch((error: NodeJS.ErrnoException) => {
			throw invalidInput(
				"profilePath",
				`Cannot open this profile directory (${error.code}). Check its path and permissions.`,
			);
		});
		if (!(await stat(path)).isDirectory()) throw invalidInput("profilePath", "Select a profile directory.");
		return input.profilePath;
	}
	const target = join(home, "accounts", id, "profile");
	await mkdir(target, { recursive: true, mode: 0o700 });
	const source = profileDefault(input.harness, env);
	for (const name of sharedEntries[input.harness]) {
		const existing = join(source, name);
		const origin = existsSync(existing) ? existing : join(home, "accounts", "shared", input.harness, name);
		if (!existsSync(existing)) await mkdir(origin, { recursive: true, mode: 0o700 });
		await symlink(origin, join(target, name));
	}
	for (const name of configFiles[input.harness]) {
		if (await Bun.file(join(source, name)).exists()) await cp(join(source, name), join(target, name));
	}
	return target;
}
const isDefaultClaudeDirectory = async (profilePath: string, env: NodeJS.ProcessEnv) => {
	const defaultDirectory = join(env.HOME ?? homedir(), ".claude");
	if (!existsSync(defaultDirectory)) return false;
	return (await realpath(profilePath)) === (await realpath(defaultDirectory));
};

export async function profileEnvironment(
	account: { harness: AccountHarness; profilePath: string },
	env: NodeJS.ProcessEnv,
) {
	if (!(await stat(account.profilePath)).isDirectory())
		throw new Error("The selected account profile directory is missing.");
	const result = { ...env };
	if (account.harness === "pi" || account.harness === "opencode") {
		for (const key of [
			"OPENAI_API_KEY",
			"ANTHROPIC_API_KEY",
			"ANTHROPIC_AUTH_TOKEN",
			"CLAUDE_CODE_OAUTH_TOKEN",
			"GEMINI_API_KEY",
			"GOOGLE_API_KEY",
			"OPENROUTER_API_KEY",
			"GROQ_API_KEY",
			"DEEPSEEK_API_KEY",
			"MISTRAL_API_KEY",
			"CEREBRAS_API_KEY",
			"XAI_API_KEY",
			"OPENCODE_API_KEY",
			"OPENCODE_AUTH_JSON",
		])
			delete result[key];
	}

	if (account.harness === "claude") {
		delete result.ANTHROPIC_API_KEY;
		delete result.ANTHROPIC_AUTH_TOKEN;
		delete result.CLAUDE_CODE_OAUTH_TOKEN;
		// Claude keeps the state of its default directory `~/.claude` in
		// `~/.claude.json` and in the default keychain entry. Once
		// CLAUDE_CONFIG_DIR is set, it reads `$CLAUDE_CONFIG_DIR/.claude.json`
		// instead, so `CLAUDE_CONFIG_DIR=~/.claude` opens a profile that has
		// never onboarded or logged in. The default directory therefore maps
		// to an unset variable, and every other profile to the variable.
		if (await isDefaultClaudeDirectory(account.profilePath, env)) delete result.CLAUDE_CONFIG_DIR;
		else result.CLAUDE_CONFIG_DIR = account.profilePath;
	} else if (account.harness === "codex") {
		delete result.OPENAI_API_KEY;
		result.CODEX_HOME = account.profilePath;
	} else if (account.harness === "pi") result.PI_CODING_AGENT_DIR = account.profilePath;
	else if (account.harness === "opencode") result.XDG_DATA_HOME = account.profilePath;

	return result;
}
