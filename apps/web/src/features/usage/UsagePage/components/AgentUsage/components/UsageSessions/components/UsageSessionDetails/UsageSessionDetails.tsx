import type { UsageSession } from "@trellis/api";
import { PropertyRow, Sheet, SheetBody } from "@trellis/ui";
import { formatUsd, harnessLabel } from "../../../../../../../formatUsage";

export function UsageSessionDetails({ session, onClose }: { session: UsageSession; onClose: () => void }) {
	const properties = [
		["Session", session.label ?? session.sessionId],
		["Session ID", session.sessionId],
		["Harness", harnessLabel[session.harness]],
		["Model", session.model],
		["API-rate cost", `${session.approximate ? "~" : ""}${formatUsd(session.usd)}`],
		["Tokens", session.tokens.toLocaleString("en-US")],
		["Turns", session.turns.toLocaleString("en-US")],
		["First turn", new Date(session.firstAt).toLocaleString()],
		["Last turn", new Date(session.lastAt).toLocaleString()],
		["Agent", session.run?.name ?? "No linked run"],
		["Run kind", session.run?.kind ?? "No linked run"],
		["Project", session.run?.projectKey ?? session.groupKeys.project],
		["Ticket", session.run?.ticketIdentifier ?? "No linked ticket"],
		["Account", session.run?.account ?? session.groupKeys.account],
	] as const;
	return (
		<Sheet
			open
			title="Session usage"
			description="Values cover the full report range. This estimate is not a subscription bill."
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetBody>
				{session.approximate && <p className="text-sm text-fg-muted">The ~ marks an approximate model price.</p>}
				<dl>
					{properties.map(([label, value]) => (
						<PropertyRow key={label} label={label} align="start">
							<span className="break-words tabular [overflow-wrap:anywhere]">{value}</span>
						</PropertyRow>
					))}
				</dl>
			</SheetBody>
		</Sheet>
	);
}
