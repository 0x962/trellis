import { join } from "node:path";
import type { HarnessAccount, HarnessAccountQuota } from "@trellis/api";
import { museUsageWindows, readMuseUsage } from "../../agents/harnesses/muse/museUsage.ts";
import { claudeWindows, codexUsage } from "./quotaWindows.ts";

type Account = Omit<HarnessAccount, "loginCommand" | "capabilities">;
export type Credential = {
	token: string | null;
	email: string | null;
	plan: string | null;
	expiresAt?: number;
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
		fetchedAt: new Date(now).toISOString(),
	};
	if (account.harness === "muse") {
		// Meta exposes no quota endpoint. The windows come from the snapshot
		// that the last Muse agent run of this profile saved. A profile
		// without `muse/auth.json` is signed out.
		const auth = await read(account);
		if (auth.email === null && auth.plan === null)
			return { ...base, status: "signed_out", detail: "Sign in with the account's login command." };
		const result = { ...base, email: auth.email, plan: null };
		const usage = await readMuseUsage(join(account.profilePath, "muse"));
		const windows = usage === null ? [] : museUsageWindows(usage, now);
		if (windows.length)
			return { ...result, status: "ok", windows, fetchedAt: new Date(usage!.observedAtMs).toISOString() };
		return {
			...result,
			status: "unavailable",
			detail:
				usage === null
					? "Muse reports its usage windows to Trellis during a Muse agent run. Start one to fill this card."
					: `The windows that the last Muse agent run observed at ${new Date(usage.observedAtMs).toISOString()} have reset. Start a Muse agent run to refresh them.`,
		};
	}
	// A harness with no quota endpoint has no window to fill, so the login
	// counts as unlimited.
	if (!["claude", "codex"].includes(account.harness)) return { ...base, status: "unlimited" };
	try {
		const auth = await read(account);
		const result = { ...base, email: auth.email, plan: auth.plan };
		if (auth.apiKey) return { ...result, status: "unlimited", detail: "API billing, priced per token." };
		if (!auth.token) return { ...result, status: "signed_out", detail: "Sign in with the account's login command." };
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
		const usage = account.harness === "codex" ? codexUsage(value, now) : { windows: claudeWindows(value) };
		return {
			...result,
			...usage,
			status: usage.windows.length ? "ok" : "unlimited",
			detail: null,
		};
	} catch {
		return {
			...base,
			status: "unavailable",
			detail: "Cannot read this account's quota. Check the profile and provider connection.",
		};
	}
}
