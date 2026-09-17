import type { UsageTotals as Totals } from "@trellis/api";
import { StackedBar } from "@trellis/ui";
import { formatShare, formatTokens, formatUsd } from "../../../formatUsage";

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-0.5">
			<span className="truncate text-xs text-fg-faint">{label}</span>
			<span className="text-xl font-semibold text-fg tabular">{value}</span>
			{detail && <span className="truncate text-xs text-fg-muted tabular">{detail}</span>}
		</div>
	);
}

// The figures of the range: four numbers, then how the tokens split. The
// cost is what the same tokens cost at the API list rate; a subscription
// bills none of it per token.
export function UsageTotals({ totals, pricingTableUpdated }: { totals: Totals; pricingTableUpdated: string }) {
	const savingsMultiple = totals.usd > 0 ? (totals.cacheSavingsUsd / totals.usd).toFixed(1) : "0";
	return (
		<section aria-label="Totals" className="flex flex-col gap-5">
			<div className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
				<Stat
					label="API-rate cost"
					value={`${totals.approximate ? "~" : ""}${formatUsd(totals.usd)}`}
					detail={`${formatUsd(totals.cacheSavingsUsd)} saved by the cache · ${savingsMultiple}x`}
				/>
				<Stat
					label="Trellis agents"
					value={formatUsd(totals.trellisUsd)}
					detail={`${formatShare(totals.trellisUsd, totals.usd) || "0%"} of the range · ${totals.runs.toLocaleString("en-US")} runs`}
				/>
				<Stat
					label="Cost per ticket"
					value={totals.tickets > 0 ? formatUsd(totals.trellisUsd / totals.tickets) : "No tickets"}
					detail={totals.tickets > 0 ? `${totals.tickets.toLocaleString("en-US")} tickets with agent work` : undefined}
				/>
				<Stat
					label="Sessions"
					value={totals.sessions.toLocaleString("en-US")}
					detail={`${formatTokens(totals.tokens)} tokens`}
				/>
			</div>
			<StackedBar
				label="Tokens by kind"
				segments={[
					{
						key: "cached",
						label: "Cached input",
						value: totals.cachedInput,
						valueLabel: formatTokens(totals.cachedInput),
						tone: "agent",
					},
					{
						key: "uncached",
						label: "Uncached input",
						value: totals.uncachedInput,
						valueLabel: formatTokens(totals.uncachedInput),
						tone: "success",
					},
					{
						key: "write",
						label: "Cache write",
						value: totals.cacheWrite,
						valueLabel: formatTokens(totals.cacheWrite),
						tone: "warning",
					},
					{ key: "output", label: "Output", value: totals.output, valueLabel: formatTokens(totals.output), tone: "fg" },
				]}
			/>
			<p className="text-xs text-fg-faint">
				Priced at the API list rate of {pricingTableUpdated}. A subscription does not bill per token; a ~ marks a model
				priced with a fallback rate or with no published price, such as Muse.
			</p>
		</section>
	);
}
