import type { Harness, HarnessAccount, HarnessAccountQuota } from "@trellis/api";

type Input = {
	harness: Harness;
	accountId: string;
	accounts: readonly HarnessAccount[];
	quotas: readonly HarnessAccountQuota[];
};

const available = (quota: HarnessAccountQuota | undefined) =>
	quota?.status === "unlimited" ||
	(quota?.status === "ok" && quota.windows.length > 0 && quota.windows.every((window) => window.usedPercent < 100));

export function selectSessionAccount({ harness, accountId, accounts, quotas }: Input): string {
	const compatible = accounts.filter((account) => account.harness === harness.preset && account.capabilities.launch);
	const previous = compatible.find((account) => account.id === accountId);
	const candidates = compatible.filter((account) => available(quotas.find((quota) => quota.accountId === account.id)));
	return (
		candidates.find((account) => account.id === previous?.id)?.id ??
		candidates.find((account) => account.isDefault)?.id ??
		candidates[0]?.id ??
		previous?.id ??
		""
	);
}
