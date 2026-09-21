import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";

export type EpicPlanProps = {
	// The description of the epic, as markdown.
	description: string;
};

// The Plan tab of the epic page: the description of the epic through the
// ticket markdown renderer.
export function EpicPlan({ description }: EpicPlanProps) {
	if (description.trim() === "") {
		return <p className="text-sm text-fg-faint">No description. Edit the epic to write the plan.</p>;
	}
	return <ReadOnlyMarkdown markdown={description} className="text-md" />;
}
