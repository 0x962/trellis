import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readOptionalJson } from "../harnessAccounts/credentials.ts";
import { profileDefault } from "../harnessAccounts/profiles.ts";
import type { UsageAccountRow } from "./roots.ts";

// The state file of a Claude profile. The default profile keeps it next
// to the profile directory, at `~/.claude.json`; a custom profile keeps it
// inside the directory.
export async function claudeStatePath(profilePath: string, env: NodeJS.ProcessEnv): Promise<string> {
	const defaultProfile = profileDefault("claude", env);
	const [real, realDefault] = await Promise.all([
		realpath(profilePath).catch(() => profilePath),
		realpath(defaultProfile).catch(() => defaultProfile),
	]);
	return real === realDefault ? join(dirname(defaultProfile), ".claude.json") : join(profilePath, ".claude.json");
}

type ClaudeState = { projects?: Record<string, { lastSessionId?: unknown }> };

// The sessions each Claude account is known to own, by session id. Several
// profiles can share one transcript directory, and a transcript names no
// account, so the state file of each profile is the one place that ties a
// session to a login: it records the last session of every directory the
// profile worked in. A later account wins a session two profiles both name.
export async function claudeSessionOwners(
	accounts: readonly UsageAccountRow[],
	env: NodeJS.ProcessEnv,
): Promise<Map<string, string>> {
	const owners = new Map<string, string>();
	for (const account of accounts) {
		if (account.harness !== "claude") continue;
		const state = (await readOptionalJson(await claudeStatePath(account.profilePath, env))) as ClaudeState | null;
		for (const project of Object.values(state?.projects ?? {})) {
			if (typeof project.lastSessionId === "string") owners.set(project.lastSessionId, account.name);
		}
	}
	return owners;
}
