import { join } from "node:path";
import type { HarnessAccount, HarnessAccountQuota } from "@trellis/api";
import { museQuotaExhausted, museUsageWindows, readMuseUsage } from "../../agents/harnesses/muse/museUsage.ts";
import { claudeUsage, codexUsage } from "./quotaWindows.ts";

type Account = Omit<HarnessAccount, "loginCommand" | "capabilities">;
export const MUSE_USAGE_MAX_AGE_MS = 60_000;
export const isCurrentMuseQuota = (quota: Pick<HarnessAccountQuota, "status" | "fetchedAt">, now: number) =>
	quota.status !== "ok" || now - Date.parse(quota.fetchedAt) <= MUSE_USAGE_MAX_AGE_MS;
export type Credential = {
	token: string | null;
	email: string | null;
	plan: string | null;
	expiresAt?: number;
	refreshTokenExpiresAt?: number;
	accountId?: string;
	apiKey?: boolean;
};
export async function fetchAccountQuota(
	account: Account,
	fetcher: typeof fetch,
	read: (account: Account) => Promise<Credential>,
	now = Date.now(),
): Promise<HarnessAccountQuota> {
	const base = {
		accountId: account.id,
		email: null,
		plan: null,
		detail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		fetchedAt: new Date(now).toISOString(),
	};
	if (account.harness === "muse") {
		// Meta exposes no quota endpoint. `bridgeEntry.ts` saves normal usage
		// and quota failures under `account.profilePath` during a Muse run.
		const usage = await readMuseUsage(join(account.profilePath, "muse"));
		const freshUsage = usage !== null && now - usage.observedAtMs <= MUSE_USAGE_MAX_AGE_MS ? usage : null;
		const exhausted = freshUsage !== null && museQuotaExhausted(freshUsage, now);
		const auth = await read(account);
		if (!exhausted && auth.email === null && auth.plan === null)
			return { ...base, status: "signed_out", detail: "Sign in with the account's login command." };
		const result = { ...base, email: auth.email, plan: null };
		const windows = freshUsage === null ? [] : museUsageWindows(freshUsage, now);
		if (freshUsage !== null && windows.length)
			return { ...result, status: "ok", windows, fetchedAt: new Date(freshUsage.observedAtMs).toISOString() };
		return {
			...result,
			status: "unavailable",
			detail:
				freshUsage === null
					? "Muse reports its usage windows to Trellis during a Muse agent run. Start one to fill this card."
					: `The windows that Muse observed at ${new Date(freshUsage.observedAtMs).toISOString()} have reset. Start a Muse agent run to refresh them.`,
		};
	}
	if (!["claude", "codex"].includes(account.harness))
		return { ...base, status: "unavailable", detail: "This provider does not expose quota windows." };
	try {
		const auth = await read(account);
		const result = { ...base, email: auth.email, plan: auth.plan };
		if (auth.apiKey) return { ...result, status: "metered", detail: "API billing, priced per token." };
		if (!auth.token) return { ...result, status: "signed_out", detail: "Sign in with the account's login command." };
		if (
			account.harness === "claude" &&
			auth.expiresAt !== undefined &&
			auth.expiresAt <= now &&
			auth.refreshTokenExpiresAt !== undefined &&
			auth.refreshTokenExpiresAt > now
		)
			return { ...result, status: "stale", detail: "Refreshes when Claude Code next runs." };
		if (auth.expiresAt !== undefined && auth.expiresAt <= now)
			return { ...result, status: "expired", detail: "Open this account in its CLI to refresh its sign-in." };
		const urls = {
			claude: "https://api.anthropic.com/api/oauth/usage",
			codex: "https://chatgpt.com/backend-api/wham/usage",
		};
		const response = await fetcher(urls[account.harness as keyof typeof urls], {
			headers: {
				Authorization: `Bearer ${auth.token}`,
				...(account.harness === "claude" ? { "anthropic-beta": "oauth-2025-04-20" } : {}),
				...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}),
			},
			signal: AbortSignal.timeout(10000),
		});
		if (response.status === 401 || response.status === 403)
			return {
				...result,
				status: "expired",
				detail: `Provider rejected this sign-in (HTTP ${response.status}). Open the CLI to sign in again.`,
			};
		if (!response.ok)
			return { ...result, status: "unavailable", detail: `Quota request failed (HTTP ${response.status}).` };
		const value = await response.json();
		const usage = account.harness === "codex" ? codexUsage(value, now) : claudeUsage(value);
		const status = usage.windows.length ? "ok" : account.harness === "codex" ? "unlimited" : "unavailable";
		return {
			...result,
			...usage,
			status,
			detail:
				status === "unlimited"
					? "This Codex account has no standard quota windows."
					: status === "unavailable"
						? "No quota data returned for this Claude plan."
						: null,
		};
	} catch {
		return {
			...base,
			status: "unavailable",
			detail: "Cannot read this account's quota. Check the profile and provider connection.",
		};
	}
}
