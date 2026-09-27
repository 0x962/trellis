import { appendFile } from "node:fs/promises";
import { laneForBranch, readLanePlans } from "./contract";
import { workflowEnvironment, writeResult, writeStepOutputs } from "./result";

const environment = workflowEnvironment();
const lane = laneForBranch(environment.branch);
const plans = await readLanePlans();
const record = await writeResult(
	{
		check: "plan-identity",
		platform: "linux-x64",
		runner: "ubuntu-24.04",
		command: "bun scripts/linux-integration/plan.ts",
		result: "passed",
	},
	lane,
);

await Bun.write(
	"evidence/plan.json",
	`${JSON.stringify({ schemaVersion: plans.schemaVersion, ...environment, lane, plan: plans.lanes[lane] }, null, 2)}\n`,
);
await writeStepOutputs(record, true);

if (process.env.GITHUB_OUTPUT) {
	await appendFile(process.env.GITHUB_OUTPUT, `lane=${lane}\n`);
}
