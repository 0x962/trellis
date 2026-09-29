import { EmptyState, FailureState } from "@trellis/ui";
import type { SessionPane } from "../sessionPane";

export type SessionPaneStateProps = {
	pane: Exclude<SessionPane, { kind: "terminal" | "archived" }>;
};

export function SessionPaneState({ pane }: SessionPaneStateProps) {
	if (pane.kind === "failed")
		return <FailureState variant="page" title={pane.title} description={pane.description} detail={pane.detail} />;
	return (
		<EmptyState
			variant="page"
			image={pane.kind === "starting" ? null : undefined}
			title={pane.title}
			description={pane.description}
		/>
	);
}
