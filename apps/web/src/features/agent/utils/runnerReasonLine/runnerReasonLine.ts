import type { RunnerReason } from "@trellis/api";

// What to say for each reason the runner cannot serve a request. Each line
// names the fix, because the person who reads it is the person who applies
// it. `disabled` covers the global switch and one project's manager switch.
export const runnerReasonLine: Record<RunnerReason, string> = {
	missing: "trellis cannot find the Superset CLI.",
	disabled: "Agents are off. Turn them on in Settings.",
	unmapped: "No Superset project matches this project. Pick one in Agents settings.",
	branch: "The base branch is not in the Superset project's repository. Enter a branch it has.",
	error: "Superset refused the start.",
};
