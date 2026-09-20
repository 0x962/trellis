import { StatusIcon } from "../../../../domain/StatusIcon";
import { Section } from "../../Section";

export function StatusIconSection() {
	return (
		<Section name="StatusIcon" note="by category; review by reviewer; started by progress">
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="todo" /> Todo
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="started" /> In Progress
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="started" progress={0.25} /> 1/4 done
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="started" progress={0.6} /> 3/5 done
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="started" progress={1} /> 5/5 done
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="review" reviewer="agent" /> Agent Review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="review" reviewer="human" /> Human Review
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="done" /> Done
			</span>
			<span className="inline-flex items-center gap-2 text-sm">
				<StatusIcon category="canceled" /> <s className="text-fg-muted">Canceled</s>
			</span>
		</Section>
	);
}
