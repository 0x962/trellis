import { Link } from "@tanstack/react-router";
import { FailureState } from "@trellis/ui";
import type { FlowDiscoveryFilters } from "../../../../../FlowsPage/flowDiscovery";
import type { FlowSettingsState } from "../../flowSettingsState";

export type FlowSettingsFeedbackProps = {
	state: FlowSettingsState;
	onReturn: (filters: FlowDiscoveryFilters) => void;
};

export function FlowSettingsFeedback({ state, onReturn }: FlowSettingsFeedbackProps) {
	switch (state.result.state) {
		case "editing":
			return null;
		case "conflict":
			return (
				<FailureState
					title="The flow changed before this save"
					description={`The server has version ${state.result.serverVersion}. Your edits remain in this form. Reload the flow before another save.`}
				/>
			);
		case "failed":
			return <FailureState title="Could not save the flow" detail={state.result.message} />;
		case "deleted":
			return (
				<FailureState
					title="This flow was deleted"
					description="Your edits remain in this form. Return to the flow list to select another flow."
					action={
						<Link to="/ai/flows" onClick={() => onReturn(state.filters)}>
							Return to flows
						</Link>
					}
				/>
			);
	}
}
