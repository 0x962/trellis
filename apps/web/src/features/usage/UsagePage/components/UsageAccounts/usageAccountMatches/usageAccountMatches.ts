import type { UsageAccount } from "@trellis/api";
import { harnessLabel, harnessProvider } from "../../../../formatUsage";
import { accountQuotaSummary } from "../accountQuotaSummary";

export const usageAccountSearchText = (account: UsageAccount) =>
	[
		account.name,
		account.harness,
		harnessLabel[account.harness],
		harnessProvider[account.harness],
		account.profilePath,
		account.isDefault ? "default" : "",
		account.quota.email,
		account.quota.plan,
		accountQuotaSummary(account),
		...account.quota.windows.map((window) => window.label),
		...account.sharedWith,
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => value.toLocaleLowerCase());

export const usageAccountMatches = (searchText: readonly string[], query: string) => {
	const normalized = query.trim().toLocaleLowerCase();
	return normalized === "" || searchText.some((value) => value.includes(normalized));
};
