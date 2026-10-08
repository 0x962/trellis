import type { HarnessAccount, UsageAccount } from "@trellis/api";

export const unavailableUsageAccounts = (accounts: readonly HarnessAccount[]): UsageAccount[] =>
	accounts.map((account) => ({
		key: `account:${account.name}`,
		id: account.id,
		name: account.name,
		harness: account.harness,
		profilePath: account.profilePath,
		isDefault: account.isDefault,
		defaultSource: null,
		loginCommand: account.loginCommand,
		sharedWith: [],
		quota: {
			status: "unavailable",
			email: null,
			plan: null,
			detail: null,
			windows: [],
			creditsBalance: null,
			extraUsage: null,
			fetchedAt: account.updatedAt,
		},
	}));
