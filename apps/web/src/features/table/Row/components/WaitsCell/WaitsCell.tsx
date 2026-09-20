import { Link } from "@tanstack/react-router";
import type { TicketSummary } from "@trellis/api";
import { AttentionDot, TicketId } from "@trellis/ui";

export type WaitsCellProps = {
	// The tickets this ticket waits for. The server leaves out a ticket that
	// is already done, so every entry here still holds the work back.
	waitsOn: TicketSummary["waitsOn"];
	// True when the ticket is Todo and no ticket holds it back.
	ready: boolean;
};

// How many identifiers the 110 px cell holds. The rest become `+n`.
const shown = 2;

// `onRowClick` in TicketTable leaves a click inside an anchor alone, so a
// click here opens the ticket it names and the row stays closed.
const linkClass =
	"inline-flex h-7 items-center rounded-md px-0.5 transition-colors duration-hover hover:bg-fg/6 focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2";

// What holds a ticket back, in the width of two identifiers.
//
// The cell prints one of four things:
//
// - nothing, when no ticket holds this one back and the work has started;
// - `ready`, when the ticket is Todo and no ticket holds it back;
// - up to two identifiers, then `+n` for the ones that do not fit;
// - the yellow dot after an identifier whose ticket is an open question,
//   which is a ticket that only a person can finish.
//
// Each identifier is a link to that ticket's page.
export function WaitsCell({ waitsOn, ready }: WaitsCellProps) {
	if (waitsOn.length === 0) return ready ? <span className="text-sm text-fg-faint">ready</span> : null;

	const rest = waitsOn.length - shown;
	return (
		<span className="flex min-w-0 items-center gap-1 truncate">
			{waitsOn.slice(0, shown).map((dependency, index) => (
				<span key={dependency.identifier} className="flex items-center gap-1">
					{index > 0 && (
						<span aria-hidden="true" className="text-fg-faint">
							·
						</span>
					)}
					<Link
						to="/t/$identifier"
						params={{ identifier: dependency.identifier }}
						className={linkClass}
						title={dependency.title}
					>
						<TicketId id={dependency.identifier} size="sm" />
					</Link>
					{dependency.isQuestion && <AttentionDot label={`${dependency.identifier} is a question for you.`} />}
				</span>
			))}
			{rest > 0 && <span className="text-xs text-fg-faint tabular">{`+${rest}`}</span>}
		</span>
	);
}
