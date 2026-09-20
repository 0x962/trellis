import {
	ActorChipSection,
	AgentProfileMarkSection,
	AttentionDotSection,
	ChainBlockSection,
	CheckRibbonSection,
	ChecksLineSection,
	ConditionsBlockSection,
	ContractBlockSection,
	FileRiskGroupsSection,
	FlowRunSection,
	LineChangesSection,
	PrGlyphSection,
	PriorityIconSection,
	ReviewFocusListSection,
	ReviewStatusSummarySection,
	RunLineSection,
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
			<ContractBlockSection />
			<ChainBlockSection />
			<RunLineSection />
		</>
	);
}
