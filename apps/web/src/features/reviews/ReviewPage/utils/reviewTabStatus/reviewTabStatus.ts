import type { CheckTabStatus } from "../../../ReviewChecks/checkGroups";
import type { liveBranchState } from "../../../ReviewLive/liveBranch";

export const checkStatusIndicator = (status: CheckTabStatus) => {
	if (status === "failed") return { label: "Checks failed", tone: "danger" as const };
	if (status === "running") return { label: "Checks running", tone: "warning" as const };
	if (status === "done") return { label: "Checks passed", tone: "success" as const };
	return undefined;
};

export const liveStatusTone = (label: ReturnType<typeof liveBranchState>["label"]) => {
	if (label === "Ready" || label === "Available") return "success" as const;
	if (label === "Update available" || label === "Enabled") return "warning" as const;
	return "neutral" as const;
};
