import { useParams, useRouter } from "@tanstack/react-router";
import { Button, FailureState } from "@trellis/ui";
import { failureKind, isConnectionFailure, RouteError } from "../../../../../features/shell/RouteError";
import { parseProjectSplat } from "../../../../../lib/projectUrl";

export type ProjectLoadErrorProps = {
	error: unknown;
};

// The project route's error state for a failure other than a missing
// project: the project ref as the subject, and the cause the error holds
// behind the disclosure.
export function ProjectLoadError({ error }: ProjectLoadErrorProps) {
	const params = useParams({ strict: false });
	const router = useRouter();
	const { ref } = parseProjectSplat(params._splat ?? "");
	if (isConnectionFailure(failureKind(error))) return <RouteError error={error} />;
	return (
		<FailureState
			variant="page"
			className="page-card"
			title={`${ref} did not load`}
			detail={error instanceof Error ? error.message : String(error)}
			action={
				<Button size="md" onClick={() => void router.invalidate()}>
					Retry
				</Button>
			}
		/>
	);
}
