import {
	ActorChipSection,
	CheckRibbonSection,
	ChecksLineSection,
	FlowRunSection,
	LineChangesSection,
	PriorityIconSection,
	ReviewStatusSummarySection,
	StatusIconSection,
	TicketGlimmerSection,
	TicketIdSection,
	TrellisMarkSection,
} from "./sections";

// The trellis-specific marks in every variant.
export function DomainSections() {
	return (
		<>
			<StatusIconSection />
			<PriorityIconSection />
			<ReviewStatusSummarySection />
			<CheckRibbonSection />
			<ChecksLineSection />
			<ActorChipSection />
			<LineChangesSection />
			<TicketIdSection />
			<TicketGlimmerSection />
			<TrellisMarkSection />
			<FlowRunSection />
		</>
	);
}
