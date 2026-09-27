import { laneForBranch, readLanePlans } from "./contract";
import { readWorkflowIdentity, writeResult, writeStepOutputs } from "./checkResult";

const workflowIdentity = readWorkflowIdentity();
const lane = laneForBranch(workflowIdentity.branch);
const plans = await readLanePlans();
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

await Bun.write(
	"evidence/plan.json",
	`${JSON.stringify({ schemaVersion: plans.schemaVersion, ...workflowIdentity, lane, plan: plans.lanes[lane] }, null, 2)}\n`,
);
await writeStepOutputs(record, true);
