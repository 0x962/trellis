import {
	ActorChipSection,
	AgentCardSection,
	CheckRibbonSection,
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
			<ActorChipSection />
			<AgentCardSection />
			<LineChangesSection />
			<TicketIdSection />
			<TicketGlimmerSection />
			<TrellisMarkSection />
			<FlowRunSection />
		</>
	);
}
