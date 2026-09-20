import { TicketId } from "../../../../domain/TicketId";
import { Section } from "../../Section";

export function TicketIdSection() {
	return (
		<Section name="TicketId" note="md in a row; sm on a card">
			<TicketId id="CDE-43" />
			<TicketId id="TRL-9" size="sm" />
		</Section>
	);
}
