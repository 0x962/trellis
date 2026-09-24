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
	MachinePressureSection,
	MergeConflictMarkSection,
	PrGlyphSection,
	PriorityIconSection,
	ProjectColorFieldSection,
	ProjectColorSection,
	ProviderCardSection,
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
			<ProviderCardSection />
			<StatusIconSection />
			<PriorityIconSection />
			<AttentionDotSection />
			<MachinePressureSection />
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
			<ProjectColorSection />
			<ProjectColorFieldSection />
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
