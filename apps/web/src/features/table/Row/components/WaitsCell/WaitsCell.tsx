import type { TicketSummary } from "@trellis/api";
import { AttentionDot, TicketId } from "@trellis/ui";
import { TicketLink } from "../../../../shell/TicketLink";

export type WaitsCellProps = {
	// The tickets this ticket waits for. The server leaves out a ticket that
	// is already done, so every entry here still holds the work back.
	waitsOn: TicketSummary["waitsOn"];
	// True when the ticket is Todo and no ticket holds it back.
	ready: boolean;
};

const shownIdentifiers = 2;

// `onRowClick` in TicketTable leaves a click inside an anchor alone, so a
// click here opens the ticket it names and the row of the waiting ticket
// stays closed.
const linkClass =
	"inline-flex h-7 items-center rounded-md px-0.5 transition-colors duration-hover hover:bg-fg/6 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// What holds this ticket back. A question is a ticket that only a person
// can finish. The yellow dot marks it.
export function WaitsCell({ waitsOn, ready }: WaitsCellProps) {
	if (waitsOn.length === 0) return ready ? <span className="text-sm text-fg-faint">ready</span> : null;

	const rest = waitsOn.length - shownIdentifiers;
	return (
		<span className="flex min-w-0 items-center gap-1 truncate">
			{waitsOn.slice(0, shownIdentifiers).map((dependency, index) => (
				<span key={dependency.identifier} className="flex items-center gap-1">
					{index > 0 && (
						<span aria-hidden="true" className="text-fg-faint">
							·
						</span>
					)}
					<TicketLink identifier={dependency.identifier} className={linkClass} title={dependency.title}>
						<TicketId id={dependency.identifier} size="sm" />
					</TicketLink>
					{dependency.isQuestion && <AttentionDot label={`${dependency.identifier} is a question for you.`} />}
				</span>
			))}
			{rest > 0 && <span className="text-xs text-fg-faint tabular">{`+${rest}`}</span>}
		</span>
	);
}
