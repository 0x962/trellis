import {
	ActorChipSection,
	AgentProfileMarkSection,
	AttentionDotSection,
	ChangeSummarySection,
	CheckConfettiSection,
	CheckRibbonSection,
	ChecksLineSection,
	FileRiskGroupsSection,
	FlowRunSection,
	LineChangesSection,
	MergeConflictMarkSection,
	PrGlyphSection,
	PriorityIconSection,
	ResourceListSection,
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
			<ReviewStatusSummarySection />
			<CheckRibbonSection />
			<CheckConfettiSection />
			<ChecksLineSection />
			<PrGlyphSection />
			<MergeConflictMarkSection />
			<ActorChipSection />
			<AgentProfileMarkSection />
			<LineChangesSection />
			<TicketIdSection />
			<TicketGlimmerSection />
			<TrellisMarkSection />
			<FlowRunSection />
			<FileRiskGroupsSection />
			<RunLineSection />
			<ChangeSummarySection />
			<StartControlsSection />
			<ResourceListSection />
		</>
	);
}
