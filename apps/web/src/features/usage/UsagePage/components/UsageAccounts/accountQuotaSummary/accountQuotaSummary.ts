import type { UsageAccount } from "@trellis/api";
import { formatDayTime } from "@trellis/ui";

type QuotaStatus = UsageAccount["quota"]["status"];

const quotaStatusLabel: Record<QuotaStatus, string> = {
	ok: "Quota available",
	unlimited: "Unlimited",
	metered: "Metered billing",
	signed_out: "Sign in required",
	stale: "Quota refresh pending",
	expired: "Sign-in expired",
	unavailable: "Quota unavailable",
};

export const accountQuotaSummary = (account: UsageAccount) => {
	if (account.quota.status !== "ok") return quotaStatusLabel[account.quota.status];
	if (account.quota.windows.length === 0) return quotaStatusLabel.ok;
	const limiting = account.quota.windows.reduce((current, window) =>
		window.usedPercent > current.usedPercent ? window : current,
	);
	const reset = limiting.resetsAt ? `Resets ${formatDayTime(limiting.resetsAt)}` : "Reset time unavailable";
	return [limiting.label, `${Math.round(limiting.usedPercent)}% used`, reset].join(" \u00b7 ");
};
