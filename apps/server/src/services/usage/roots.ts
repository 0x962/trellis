import { realpath } from "node:fs/promises";
import { join } from "node:path";
import type { AccountHarness, UsageHarness } from "@trellis/api";
import { profileDefault } from "../harnessAccounts/profiles.ts";

// One directory the scan reads, with the names of the accounts whose
// profile holds it. A managed Claude profile links its `projects` directory
// to the shared one, so several accounts can name one root.
export type UsageRoot = { harness: UsageHarness; path: string; accounts: string[] };

export type UsageAccountRow = { harness: AccountHarness; profilePath: string; name: string; isDefault: boolean };

const HARNESSES: readonly AccountHarness[] = ["claude", "codex", "pi", "opencode", "muse"];

// Where a profile keeps its transcripts. A Muse profile is an XDG data home,
// so its sessions sit under `muse/sessions`.
export const transcriptDir = (harness: UsageHarness, profilePath: string) => {
	if (harness === "claude") return join(profilePath, "projects");
	if (harness === "codex") return join(profilePath, "sessions");
	if (harness === "pi") return join(profilePath, "sessions");
	if (harness === "muse") return join(profilePath, "muse", "sessions");
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
	for (const account of accounts) {
		candidates.push({
			harness: account.harness,
			dir: transcriptDir(account.harness, account.profilePath),
			account: account.name,
		});
	}
	const resolved = await Promise.all(
		candidates.map(async (candidate) => {
			try {
				return { ...candidate, real: await realpath(candidate.dir) };
			} catch {
				return null;
			}
		}),
	);
	const roots = new Map<string, UsageRoot>();
	for (const candidate of resolved) {
		if (candidate === null) continue;
		const key = `${candidate.harness}:${candidate.real}`;
		const root = roots.get(key) ?? { harness: candidate.harness, path: candidate.real, accounts: [] };
		if (candidate.account !== null && !root.accounts.includes(candidate.account)) root.accounts.push(candidate.account);
		roots.set(key, root);
	}
	return [...roots.values()];
}
