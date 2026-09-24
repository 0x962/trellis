import type { UsageTotals as Totals } from "@trellis/api";
import { StackedBar, StatTile } from "@trellis/ui";
import { formatShare, formatTokens, formatUsd } from "../../../formatUsage";

// The figures of the range: four numbers, then how the tokens split. The
// cost is what the same tokens cost at the API list rate; a subscription
// bills none of it per token.
export function UsageTotals({ totals, pricingTableUpdated }: { totals: Totals; pricingTableUpdated: string }) {
	return (
		<section aria-label="Totals" className="flex flex-col gap-5">
			<div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
				<StatTile
					label="API-rate cost"
					value={`${totals.approximate ? "~" : ""}${formatUsd(totals.usd)}`}
					detail={`${formatUsd(totals.cacheSavingsUsd)} net cache savings`}
				/>
				<StatTile
					label="Trellis agent cost"
					value={formatUsd(totals.trellisUsd)}
					detail={`${formatShare(totals.trellisUsd, totals.usd) || "0%"} of the API-rate cost · ${totals.runs.toLocaleString("en-US")} runs`}
				/>
				<StatTile
					label="Agent cost per ticket"
					value={totals.tickets > 0 ? formatUsd(totals.trellisUsd / totals.tickets) : formatUsd(0)}
					detail={
						totals.tickets > 0
							? `${totals.tickets.toLocaleString("en-US")} tickets with agent work`
							: "No ticket took agent work"
					}
				/>
				<StatTile
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
			<p className="max-w-prose text-xs text-fg-faint text-pretty">
				Priced at the API list rate of {pricingTableUpdated}. A subscription does not bill per token. A ~ marks a model
				priced with a fallback rate.
			</p>
		</section>
	);
}
