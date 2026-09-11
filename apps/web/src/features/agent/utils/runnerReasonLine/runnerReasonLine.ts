import type { RunnerReason } from "@trellis/api";

// What to say for each reason the runner cannot serve a request.
// `disabled` covers the global switch and one project's manager switch.
export const runnerReasonLine: Record<RunnerReason, string> = {
	missing: "trellis cannot find the Superset CLI.",
	disabled: "Agents are off. Turn them on in Settings.",
	unmapped: "No Superset project matches this project. Pick one in Settings.",
	branch: "The repository holds no branch with the name of the base branch. Change it in Settings.",
	error: "Superset did not answer.",
};
