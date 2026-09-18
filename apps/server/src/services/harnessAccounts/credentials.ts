import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { Credential } from "./fetchQuota.ts";
import { museConfigDefault, profileDefault } from "./profiles.ts";
import type { AccountRow } from "./queries.ts";

const exec = promisify(execFile);
const credential = z.object({
	claudeAiOauth: z
		.object({
			accessToken: z.string(),
			expiresAt: z.number().optional(),
			refreshToken: z.string().optional(),
			refreshTokenExpiresAt: z.number().optional(),
			subscriptionType: z.string().optional(),
		})
		.optional(),
});
const codex = z.object({
	OPENAI_API_KEY: z.string().nullish(),
	tokens: z.object({ access_token: z.string(), account_id: z.string().optional() }).optional(),
});
// Muse keeps the token of its login in the macOS Keychain. Its `auth.json`
// holds the identity of the login and the name of the storage only.
const muse = z.object({
	providers: z
		.object({ meta: z.object({ user_email: z.string().optional(), mechanism: z.string().optional() }).optional() })
		.optional(),
});
export async function readOptionalJson(path: string): Promise<unknown | null> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw new Error(`Cannot read account state at ${path}.`);
	}
}
async function keychain(service: string): Promise<unknown[]> {
	if (platform() !== "darwin") return [];
	const accounts = [...new Set([process.env.USER, userInfo().username, "unknown"])].filter(
		(value): value is string => !!value,
	);
	const values: unknown[] = [];
	for (const scope of [...accounts.map((account) => ["-a", account]), []]) {
		try {
			const raw = (
				await exec("security", ["find-generic-password", ...scope, "-s", service, "-w"], { timeout: 5000 })
			).stdout.trim();
			if (raw && !values.some((value) => JSON.stringify(value) === raw)) values.push(JSON.parse(raw));
		} catch {}
	}
	return values;
}

export const parseClaudeCredential = (value: unknown): Credential | null => {
	const parsed = credential.safeParse(value);
	const auth = parsed.success ? parsed.data.claudeAiOauth : undefined;
	if (!auth) return null;
	return {
		token: auth.accessToken,
		email: null,
		plan: auth.subscriptionType ?? null,
		expiresAt: auth.expiresAt,
		refreshTokenExpiresAt:
			auth.refreshToken && auth.refreshTokenExpiresAt !== undefined ? auth.refreshTokenExpiresAt : undefined,
	};
};

export const classifyClaudeCredential = (value: Credential, now: number): "live" | "stale" | "expired" => {
	if (value.expiresAt === undefined || value.expiresAt > now) return "live";
	if (value.refreshTokenExpiresAt !== undefined && value.refreshTokenExpiresAt > now) return "stale";
	return "expired";
};

export const pickFreshestClaudeCredential = (values: Array<Credential | null>, now: number): Credential | null => {
	const rank = { live: 2, stale: 1, expired: 0 } as const;
	return values.reduce<Credential | null>((best, value) => {
		if (!value) return best;
		if (!best) return value;
		const valueRank = rank[classifyClaudeCredential(value, now)];
		const bestRank = rank[classifyClaudeCredential(best, now)];
		if (valueRank > bestRank) return value;
		if (valueRank < bestRank) return best;
		return (value.expiresAt ?? Number.POSITIVE_INFINITY) > (best.expiresAt ?? Number.POSITIVE_INFINITY) ? value : best;
	}, null);
};

const keychainServices = (profilePath: string, main: boolean) => {
	if (main) return ["Claude Code-credentials"];
	const home = homedir();
	const spellings = new Set([profilePath]);
	if (profilePath.startsWith(home)) {
		spellings.add(`~${profilePath.slice(home.length)}`);
		spellings.add(`$HOME${profilePath.slice(home.length)}`);
	}
	if (profilePath.endsWith("/")) spellings.add(profilePath.slice(0, -1));
	else spellings.add(`${profilePath}/`);
	return [...spellings].map(
		(path) => `Claude Code-credentials-${createHash("sha256").update(path.normalize("NFC")).digest("hex").slice(0, 8)}`,
	);
};
export async function readCredential(account: Pick<AccountRow, "harness" | "profilePath">): Promise<Credential> {
	const empty: Credential = { token: null, email: null, plan: null };
	if (account.harness === "codex") {
		const data = await readOptionalJson(join(account.profilePath, "auth.json"));
		if (!data) return empty;
		const parsed = codex.parse(data);
		return {
			...empty,
			token: parsed.tokens?.access_token ?? null,
			accountId: parsed.tokens?.account_id,
			apiKey: !!parsed.OPENAI_API_KEY,
		};
	}
	if (account.harness === "muse") {
		const configHome =
			account.profilePath === profileDefault("muse", process.env)
				? museConfigDefault(process.env)
				: account.profilePath;
		const data = await readOptionalJson(join(configHome, "muse", "auth.json"));
		if (!data) return empty;
		const parsed = muse.parse(data);
		return {
			...empty,
			email: parsed.providers?.meta?.user_email ?? null,
			plan: parsed.providers?.meta?.mechanism ?? null,
		};
	}
	if (account.harness !== "claude") return empty;
	const main = account.profilePath === join(homedir(), ".claude");
	const identity = await readOptionalJson(
		main ? join(homedir(), ".claude.json") : join(account.profilePath, ".claude.json"),
	);
	const email = identity
		? (z.object({ oauthAccount: z.object({ emailAddress: z.string().optional() }).optional() }).parse(identity)
				.oauthAccount?.emailAddress ?? null)
		: null;
	const files = [
		await readOptionalJson(join(account.profilePath, ".credentials.json")),
		...(main ? [await readOptionalJson(join(homedir(), ".config", "claude", "credentials.json"))] : []),
	];
	const secrets = (await Promise.all(keychainServices(account.profilePath, main).map(keychain))).flat();
	const auth = pickFreshestClaudeCredential([...files, ...secrets].map(parseClaudeCredential), Date.now());
	return auth ? { ...auth, email } : empty;
}
