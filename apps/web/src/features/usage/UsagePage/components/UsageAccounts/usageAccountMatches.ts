import type { UsageAccount } from "@trellis/api";
import { harnessLabel, harnessProvider } from "../../../formatUsage";
import { accountQuotaSummary } from "./components/UsageAccountRow/UsageAccountRow";

export const usageAccountMatches = (account: UsageAccount, query: string) => {
	const normalized = query.trim().toLocaleLowerCase();
	if (normalized === "") return true;
	return [
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
		.some((value) => value.toLocaleLowerCase().includes(normalized));
};
