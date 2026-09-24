import type { AgentRun } from "@trellis/api";
import { agentProfileOf } from "../../agentProfileOf";
import { harnessLabel } from "../../harnessPresets";
import { modelFamily } from "../../ModelPicker";

// The word the Agent row of a ticket prints for the agent it holds: the
// family of the model, such as Opus or Sol.
//
// A run that recorded no model prints the name of its harness instead. The
// app never resolves an absent model to the default of today, because the run
// can have started on the default of an earlier day, and the family of an
// absent model is "Other", which names nothing a reader knows.
export const agentLabel = (run: Pick<AgentRun, "name" | "harness">) => {
	const harness = run.harness;
	if (harness === null || harness.preset === "custom") return run.name;
	if (harness.model === undefined) return harnessLabel(harness.preset);
	return modelFamily(agentProfileOf(harness).model);
};
