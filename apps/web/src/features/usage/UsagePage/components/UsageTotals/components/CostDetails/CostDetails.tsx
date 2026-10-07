import type { UsageTotals } from "@trellis/api";
import { GroupHeader, PropertyRow } from "@trellis/ui";
import { useId, useState } from "react";
import { formatUsd } from "../../../../../formatUsage";

export function CostDetails({ totals, pricingDate }: { totals: UsageTotals; pricingDate: string }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	const drivers = [
		["Uncached input", totals.uncachedInput],
		["Cached input", totals.cachedInput],
		["Cache writes", totals.cacheWrite],
		["Output", totals.output],
		["Reasoning output", totals.reasoningOutput],
	] as const;
	return (
		<div className="border-t border-border px-7 py-4 max-sm:px-4">
			<p className="text-sm text-fg-muted">
				Costs cover the full report range. This estimate is not a subscription bill.
			</p>
			<p className="mt-2 text-sm text-fg-muted">
				{totals.approximate
					? "Some prices are approximate. A ~ marks a model without an exact price in the rate table."
					: "The report has no approximate model prices."}
			</p>
			<GroupHeader
				group="usage-cost-details"
				label="Cost details"
				appearance="strip"
				expanded={open}
				onToggle={() => setOpen((value) => !value)}
				controls={id}
			/>
			<div id={id} hidden={!open}>
				<p className="my-3 text-sm text-fg-muted">
					Reported harness costs take precedence. Other turns use API list prices dated {pricingDate}. Approximate
					models use the lowest rate for their harness.
				</p>
				<dl>
					<PropertyRow label="Trellis cost">
						<span className="tabular">{formatUsd(totals.trellisUsd)}</span>
					</PropertyRow>
					<PropertyRow label="Other cost">
						<span className="tabular">{formatUsd(totals.usd - totals.trellisUsd)}</span>
					</PropertyRow>
					<PropertyRow label="Cache savings">
						<span className="tabular">{formatUsd(totals.cacheSavingsUsd)}</span>
					</PropertyRow>
					{drivers.map(([label, count]) => (
						<PropertyRow key={label} label={label}>
							<span className="tabular">{count.toLocaleString("en-US")} tokens</span>
						</PropertyRow>
					))}
				</dl>
				<p className="mt-3 text-sm text-fg-muted">
					Trellis cost comes from linked agent runs. Other cost comes from sessions without a linked run.
				</p>
				<p className="mt-2 text-sm text-fg-muted">
					Cache savings compare table-priced input with uncached input and include the extra cost of cache writes.
					Reported harness costs are excluded. Do not subtract savings from the cost estimate.
				</p>
				<p className="mt-2 text-sm text-fg-muted">
					Reasoning output is part of output. Token classes explain volume; the report does not supply a cost per class.
				</p>
			</div>
		</div>
	);
}
