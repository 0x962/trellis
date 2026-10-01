import type { UsageTotals as Totals } from "@trellis/api";
import { StatTile } from "@trellis/ui";
import { formatTokens, formatUsd } from "../../../formatUsage";

export function UsageTotals({ totals }: { totals: Totals }) {
	return (
		<div className="grid grid-cols-3 gap-6 px-7 py-6 max-sm:grid-cols-2 max-sm:px-4">
			<StatTile
				size="large"
				label="API-rate cost"
				value={`${totals.approximate ? "~" : ""}${formatUsd(totals.usd)}`}
				detail="API list-price estimate"
				className="max-sm:col-span-2"
			/>
			<StatTile
				size="large"
				label="Tokens"
				value={formatTokens(totals.tokens)}
				detail="All models and harnesses"
				className="border-l border-border pl-6 max-sm:border-0 max-sm:pl-0"
			/>
			<StatTile
				size="large"
				label="Sessions"
				value={totals.sessions.toLocaleString("en-US")}
				detail="With usage in this range"
				className="border-l border-border pl-6 max-sm:border-0 max-sm:pl-0"
			/>
		</div>
	);
}
