import { type Priority, PriorityIcon } from "../../../../domain/PriorityIcon";
import { Section } from "../../Section";

const priorities: Priority[] = ["none", "low", "medium", "high", "urgent"];

export function PriorityIconSection() {
	return (
		<Section name="PriorityIcon" note="none, low, medium, high, urgent">
			{priorities.map((priority) => (
				<span key={priority} className="inline-flex items-center gap-2 text-sm">
					<PriorityIcon priority={priority} /> {priority}
				</span>
			))}
		</Section>
	);
}
