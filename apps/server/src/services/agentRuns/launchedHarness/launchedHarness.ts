import { type Harness, supportsModel } from "@trellis/api";

// The harness to store on an agent run once its process runs.
//
// A launch request can leave `model` empty. The harness program then selects
// its own model, so the request does not name the model that runs. The
// runtime daemon reads that model from the session event of the harness
// program and reports it as `agent.model`, in the form the model catalog
// uses.
//
// `reported` holds whatever the harness program sent, so a name that the
// catalog does not list stays out of the stored harness. The `model` field
// of a stored harness accepts a catalog id and nothing else.
export function launchedHarness(harness: Harness, reported: string | null | undefined): Harness {
	if (reported == null || !supportsModel(harness.preset, reported)) return harness;
	return { ...harness, model: reported };
}
