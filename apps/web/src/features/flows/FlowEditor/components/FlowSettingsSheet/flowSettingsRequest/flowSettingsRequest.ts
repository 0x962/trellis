import type { FlowMetadataRequest, FlowSettingsState } from "../flowSettingsState";

export function flowSettingsRequest(state: FlowSettingsState): FlowMetadataRequest | null {
	if (state.result.state === "conflict" || state.result.state === "deleted") return null;
	const { name, slug, description, briefing, project, harness } = state.draft;
	return {
		name,
		slug,
		description,
		briefing,
		project,
		harness,
		flow: state.flow.id,
		expectedVersion: state.flow.version,
	};
}
