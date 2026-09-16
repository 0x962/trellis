import type { UsageTotals as Totals } from "@trellis/api";
import { formatShare, formatTokens, formatUsd } from "../../../formatUsage";

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="truncate text-xs text-fg-faint">{label}</span>
			<span className="text-md font-medium text-fg tabular">{value}</span>
		</div>
	);
}

// The figures of the range in one strip. The cost is what the same tokens
// cost at the API list rate; a subscription bills none of it per token.
export function UsageTotals({ totals, pricingTableUpdated }: { totals: Totals; pricingTableUpdated: string }) {
	const observedInput = totals.uncachedInput + totals.cachedInput + totals.cacheWrite;
	const savingsMultiple = totals.usd > 0 ? (totals.cacheSavingsUsd / totals.usd).toFixed(1) : "0";
	return (
		<div className="flex flex-col gap-2">
			<div className="grid grid-cols-2 gap-x-6 gap-y-3 border-y border-border py-3 sm:grid-cols-4 lg:grid-cols-8">
				<Stat label="API-rate cost" value={`${totals.approximate ? "~" : ""}${formatUsd(totals.usd)}`} />
				<Stat
					label="Trellis agents"
					value={`${formatUsd(totals.trellisUsd)} · ${formatShare(totals.trellisUsd, totals.usd)}`}
				/>
				<Stat label="Tokens" value={formatTokens(totals.tokens)} />
				<Stat
					label="Cached input"
					value={`${formatTokens(totals.cachedInput)} · ${formatShare(totals.cachedInput, observedInput)}`}
				/>
				<Stat label="Output" value={formatTokens(totals.output)} />
				<Stat label="Cache savings" value={`${formatUsd(totals.cacheSavingsUsd)} · ${savingsMultiple}x`} />
				<Stat
					label="Sessions"
					value={`${totals.sessions.toLocaleString("en-US")} · ${totals.runs.toLocaleString("en-US")} runs`}
				/>
				<Stat
					label="Cost per ticket"
					value={
						totals.tickets > 0
							? `${formatUsd(totals.trellisUsd / totals.tickets)} · ${totals.tickets} tickets`
							: "No tickets"
					}
				/>
			</div>
			<p className="text-xs text-fg-faint">
				Priced at the API list rate of {pricingTableUpdated}. A subscription does not bill per token; a ~ marks a model
				priced with a fallback rate.
			</p>
		</div>
	);
}
