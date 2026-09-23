import {
	ActorChipSection,
	AgentProfileMarkSection,
	AttentionDotSection,
	ChangeSummarySection,
	CheckConfettiSection,
	CheckRibbonSection,
	ChecksLineSection,
	DoneWashSection,
	FailureStateSection,
	FileRiskGroupsSection,
	FlowRunSection,
	LineChangesSection,
	MergeConflictMarkSection,
	PrGlyphSection,
	PriorityIconSection,
	ProjectRoomSection,
	ResourceListSection,
	ReviewDiffSection,
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
			<FailureStateSection />
			<StatusIconSection />
			<PriorityIconSection />
			<AttentionDotSection />
			<ReviewStatusSummarySection />
			<CheckRibbonSection />
			<CheckConfettiSection />
			<DoneWashSection />
			<ChecksLineSection />
			<PrGlyphSection />
			<MergeConflictMarkSection />
			<ActorChipSection />
			<AgentProfileMarkSection />
			<LineChangesSection />
			<TicketIdSection />
			<TicketGlimmerSection />
			<TrellisMarkSection />
			<ProjectRoomSection />
			<FlowRunSection />
			<FileRiskGroupsSection />
			<ReviewDiffSection />
			<RunLineSection />
			<ChangeSummarySection />
			<StartControlsSection />
			<ResourceListSection />
		</>
	);
}
