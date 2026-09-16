import type { HarnessAccount, HarnessAccountQuota } from "@trellis/api";
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
		// Meta exposes no quota endpoint. A signed-in Muse login counts as
		// unlimited, and a profile without `muse/auth.json` is signed out.
		const auth = await read(account);
		return auth.email === null && auth.plan === null
			? { ...base, status: "signed_out", detail: "Sign in with the account's login command." }
			: { ...base, email: auth.email, plan: auth.plan, status: "unlimited" };
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
