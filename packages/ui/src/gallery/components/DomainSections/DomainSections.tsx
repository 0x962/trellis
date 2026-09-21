import {
	ActorChipSection,
	AgentProfileMarkSection,
	AttentionDotSection,
	BackendEvidenceSection,
	ChangeSummarySection,
	CheckRibbonSection,
	ChecksLineSection,
	ConditionsBlockSection,
	EvidenceStripSection,
	FileRiskGroupsSection,
	FlowRunSection,
	LineChangesSection,
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
			<RunLineSection />
			<ChangeSummarySection />
			<EvidenceStripSection />
			<BackendEvidenceSection />
			<StartControlsSection />
			<ResourceListSection />
		</>
	);
}
