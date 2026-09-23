import { useParams } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { parseProjectSplat } from "../../../../../lib/projectUrl";

export type ProjectLoadErrorProps = {
	error: unknown;
};

// The project route's error state for a failure other than a missing
// project: the project ref as the subject, then the cause the error holds.
export function ProjectLoadError({ error }: ProjectLoadErrorProps) {
	const params = useParams({ strict: false });
	const { ref } = parseProjectSplat(params._splat ?? "");
	return (
		<EmptyState
			variant="page"
			className="page-card"
			title={`${ref} did not load.`}
			description={error instanceof Error ? error.message : String(error)}
		/>
	);
}
