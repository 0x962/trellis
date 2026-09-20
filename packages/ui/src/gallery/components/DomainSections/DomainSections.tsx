import {
	ActorChipSection,
	AgentProfileMarkSection,
	AttentionDotSection,
	CheckRibbonSection,
	ChecksLineSection,
	ConditionsBlockSection,
	FileRiskGroupsSection,
	FlowRunSection,
	LineChangesSection,
	PrGlyphSection,
	PriorityIconSection,
	ReviewFocusListSection,
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
			<AttentionDotSection />
			<ReviewFocusListSection />
			<ReviewStatusSummarySection />
			<CheckRibbonSection />
			<ChecksLineSection />
			<PrGlyphSection />
			<ActorChipSection />
			<AgentProfileMarkSection />
			<LineChangesSection />
			<TicketIdSection />
			<TicketGlimmerSection />
			<TrellisMarkSection />
			<FlowRunSection />
			<FileRiskGroupsSection />
			<ConditionsBlockSection />
		</>
	);
}
