import {
	ActorChipSection,
	AgentProfileMarkSection,
	AttentionDotSection,
	ChainBlockSection,
	ChangeSummarySection,
	CheckRibbonSection,
	ChecksLineSection,
	ConditionsBlockSection,
	ContractBlockSection,
	EvidenceStripSection,
	FileRiskGroupsSection,
	FlowRunSection,
	LineChangesSection,
	PrGlyphSection,
	PriorityIconSection,
	QuestionBlockSection,
	ReviewFocusListSection,
	ReviewStatusSummarySection,
	RunLineSection,
	StartControlsSection,
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
			<QuestionBlockSection />
			<RunLineSection />
			<ChangeSummarySection />
			<EvidenceStripSection />
			<StartControlsSection />
		</>
	);
}
