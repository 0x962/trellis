import { readWorkflowIdentity, writeResult, writeStepOutputs } from "./checkResult";
import { laneForBranch } from "./contract";

const workflowIdentity = readWorkflowIdentity();
const lane = laneForBranch(workflowIdentity.branch);
const record = await writeResult(
	{
		check: "plan-identity",
		platform: "linux-x64",
		runner: "ubuntu-24.04",
		command: "bun scripts/linux-integration/recordLanePlan.ts",
		result: "passed",
	},
	lane,
);
await writeStepOutputs(record, true);
