import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AccountHarness, UsageHarness } from "@trellis/api";
import { profileDefault } from "../harnessAccounts/profiles.ts";

// One directory the scan reads, with the names of the accounts whose
// profile holds it. A managed Claude profile links its `projects` directory
// to the shared one, so several accounts can name one root.
export type UsageRoot = { harness: UsageHarness; path: string; accounts: string[] };

export type UsageAccountRow = { harness: AccountHarness; profilePath: string; name: string; isDefault: boolean };

const HARNESSES: readonly AccountHarness[] = ["claude", "codex", "pi", "opencode"];

// Where Muse keeps its sessions: under the XDG data home. Its login lives
// apart, under the XDG config home, which museConfigDir names.
export const museDataDir = (env: NodeJS.ProcessEnv) =>
	join(env.XDG_DATA_HOME?.trim() || join(env.HOME ?? homedir(), ".local", "share"), "muse");
export const museConfigDir = (env: NodeJS.ProcessEnv) =>
	join(env.XDG_CONFIG_HOME?.trim() || join(env.HOME ?? homedir(), ".config"), "muse");

// Where a profile keeps its transcripts.
export const transcriptDir = (harness: UsageHarness, profilePath: string) => {
	if (harness === "claude") return join(profilePath, "projects");
	if (harness === "codex") return join(profilePath, "sessions");
	if (harness === "pi") return join(profilePath, "sessions");
	if (harness === "muse") return join(profilePath, "sessions");
	return join(profilePath, "opencode", "storage");
};

// The transcript directories of the default profile of every harness and of
// every account, resolved to their real paths and merged. A directory that
// does not exist is left out.
export async function usageRoots(accounts: readonly UsageAccountRow[], env: NodeJS.ProcessEnv): Promise<UsageRoot[]> {
	const candidates: Array<{ harness: UsageHarness; dir: string; account: string | null }> = [];
	for (const harness of HARNESSES) {
		candidates.push({ harness, dir: transcriptDir(harness, profileDefault(harness, env)), account: null });
	}
	candidates.push({ harness: "muse", dir: transcriptDir("muse", museDataDir(env)), account: null });
	for (const account of accounts) {
		candidates.push({
			harness: account.harness,
			dir: transcriptDir(account.harness, account.profilePath),
			account: account.name,
		});
	}
	const roots = new Map<string, UsageRoot>();
	for (const candidate of candidates) {
		let real: string;
		try {
			real = await realpath(candidate.dir);
		} catch {
			continue;
		}
		const key = `${candidate.harness}:${real}`;
		const root = roots.get(key) ?? { harness: candidate.harness, path: real, accounts: [] };
		if (candidate.account !== null && !root.accounts.includes(candidate.account)) root.accounts.push(candidate.account);
		roots.set(key, root);
	}
	return [...roots.values()];
}
