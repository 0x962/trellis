import {
	ActorChipSection,
	CheckRibbonSection,
	ChecksLineSection,
	FlowRunSection,
	LineChangesSection,
	PrGlyphSection,
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
			<PrGlyphSection />
			<ActorChipSection />
			<LineChangesSection />
			<TicketIdSection />
			<TicketGlimmerSection />
			<TrellisMarkSection />
			<FlowRunSection />
		</>
	);
}
