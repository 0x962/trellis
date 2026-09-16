import { realpath } from "node:fs/promises";
import type { AccountHarness, UsageAccount, UsageAccountsInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { executionEnvironment } from "../../executionEnvironment";
import { readCredential } from "../harnessAccounts/credentials.ts";
import { type Credential, fetchAccountQuota } from "../harnessAccounts/fetchQuota.ts";
import { resolveHostDefault } from "../harnessAccounts/hostDefault.ts";
import { loginCommandFor } from "../harnessAccounts/presentation.ts";
import { profileDefault } from "../harnessAccounts/profiles.ts";
import type { AccountRow } from "../harnessAccounts/queries.ts";
import type { IoCtx } from "../support.ts";
import { usageRoots } from "./roots.ts";

// The harnesses whose default login exposes subscription quota. Pi and
// OpenCode do not, so a default login of theirs adds nothing to the page.
const QUOTA_HARNESSES: readonly AccountHarness[] = ["claude", "codex"];

const CACHE_MS = 5 * 60 * 1000;
const REFRESH_FLOOR_MS = 10 * 1000;

export type UsageLogin = Omit<UsageAccount, "quota">;

const listAccounts = (tx: Tx) =>
	rows<AccountRow>(
		tx,
		sql`SELECT id, name, harness, profile_path AS "profilePath", is_default AS "isDefault", enabled,
			to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
			to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
		FROM harness_accounts WHERE archived_at IS NULL ORDER BY harness, name, id`,
	);

// Every login the page shows: each configured account, then the default
// login of each quota harness whose profile directory exists and is not
// the profile of a configured account. The key of a login is the row key
// the usage report gives the sessions of that login. The default of each
// harness is the one hostDefault.ts resolves, with its source.
export async function usageLogins(accounts: readonly AccountRow[], env: NodeJS.ProcessEnv): Promise<UsageLogin[]> {
	const defaults = new Map<AccountHarness, Awaited<ReturnType<typeof resolveHostDefault<AccountRow>>>>();
	for (const harness of ["claude", "codex", "pi", "opencode"] as const)
		defaults.set(harness, await resolveHostDefault(harness, accounts, env));
	const defaultOf = (harness: AccountHarness, profilePath: string, id: string | null) => {
		const resolved = defaults.get(harness)!;
		const isDefault = resolved.account ? resolved.account.id === id : resolved.profilePath === profilePath;
		return { isDefault, defaultSource: isDefault ? resolved.source : null };
	};
	// The accounts that share one transcript directory. A session in such a
	// directory can belong to any of them, so each card names the others.
	const roots = await usageRoots(accounts, env);
	const sharedWith = (account: AccountRow) =>
		roots
			.filter((root) => root.harness === account.harness && root.accounts.includes(account.name))
			.flatMap((root) => root.accounts)
			.filter((name) => name !== account.name);
	const logins: UsageLogin[] = accounts.map((account) => ({
		key: `account:${account.name}`,
		id: account.id,
		name: account.name,
		harness: account.harness,
		profilePath: account.profilePath,
		...defaultOf(account.harness, account.profilePath, account.id),
		loginCommand: loginCommandFor(account.harness, account.profilePath),
		sharedWith: sharedWith(account),
	}));
	const configured = new Set<string>();
	for (const account of accounts) {
		try {
			configured.add(`${account.harness}:${await realpath(account.profilePath)}`);
		} catch {
			// The profile directory of this account is gone.
		}
	}
	for (const harness of QUOTA_HARNESSES) {
		const profilePath = profileDefault(harness, env);
		let real: string;
		try {
			real = await realpath(profilePath);
		} catch {
			continue;
		}
		if (configured.has(`${harness}:${real}`)) continue;
		logins.push({
			key: `default:${harness}`,
			id: null,
			name: "Default login",
			harness,
			profilePath,
			...defaultOf(harness, profilePath, null),
			loginCommand: loginCommandFor(harness, profilePath),
			sharedWith: [],
		});
	}
	return logins;
}

const cache = new Map<string, { at: number; result: Promise<UsageAccount[]> }>();

// Reads the quota of every login outside every database transaction, and
// caches the list for five minutes per data home. A refresh is served from
// the cache for ten seconds.
export const prepareAccounts = async (
	ctx: IoCtx,
	input: UsageAccountsInput,
	deps = {
		env: () => executionEnvironment(),
		now: Date.now,
		quota: (login: UsageLogin) =>
			fetchAccountQuota(
				{ ...login, id: login.id ?? "", enabled: true, createdAt: "", updatedAt: "" },
				fetch,
				readCredential as (account: { harness: AccountHarness; profilePath: string }) => Promise<Credential>,
			),
	},
): Promise<UsageAccount[]> => {
	const key = ctx.home;
	const saved = cache.get(key);
	const now = deps.now();
	if (saved && now - saved.at < (input.refresh ? REFRESH_FLOOR_MS : CACHE_MS)) return saved.result;
	const result = (async () => {
		const accounts = await ctx.newTx(listAccounts);
		const logins = await usageLogins(accounts, await deps.env());
		return Promise.all(
			logins.map(async (login) => {
				const { accountId: _accountId, ...quota } = await deps.quota(login);
				return { ...login, quota };
			}),
		);
	})();
	cache.set(key, { at: now, result });
	result.catch(() => {
		if (cache.get(key)?.result === result) cache.delete(key);
	});
	return result;
};
