import type { TicketSummary } from "@trellis/api";
import { layout } from "../../theme/layout";
import { ActorChip } from "../ActorChip";
import { CheckRibbon } from "../CheckRibbon";
import { PriorityIcon } from "../PriorityIcon";
import { Row } from "../Row";
import { StatusIcon } from "../StatusIcon";
import { prChecks } from "./prChecks";

export type TicketRowProps = {
	ticket: TicketSummary;
	// Takes the identifier of the pressed ticket, such as CDE-42.
	onPress: (identifier: string) => void;
	testID?: string;
};

// The share of the sub-tickets that are done, which fills the started disc.
// A ticket without a sub-ticket has no share, and the disc stays half full.
const progressOf = (ticket: TicketSummary) =>
	ticket.childCount === 0 ? undefined : ticket.childDoneCount / ticket.childCount;

// One ticket in a list: the priority mark, the identifier, the title, the
// status mark, the check ribbon, and the last actor.
export function TicketRow({ ticket, onPress, testID = "ticket-row" }: TicketRowProps) {
	const { status, pr, lastActor } = ticket;
	return (
		<Row
			testID={testID}
			height={layout.ticketRow}
			id={ticket.identifier}
			title={ticket.title}
			leading={
				<>
					<PriorityIcon priority={ticket.priority} />
					<StatusIcon
						category={status.category}
						reviewer={status.reviewer ?? "human"}
						progress={progressOf(ticket)}
						label={status.name}
					/>
				</>
			}
			meta={
				<>
					{pr !== null && <CheckRibbon size="mini" checks={prChecks(pr)} />}
					{lastActor !== null && <ActorChip name={lastActor.displayName ?? lastActor.name} kind={lastActor.kind} />}
				</>
			}
			onPress={() => onPress(ticket.identifier)}
		/>
	);
}
