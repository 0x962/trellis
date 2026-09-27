import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import {
	laneForBranch,
	missingRequiredPaths,
	readLanePlans,
	type CommandPlan,
	type Result,
	type SmokePlan,
} from "./contract";
import { readWorkflowIdentity, requiredVariable, writeResult, writeStepOutputs } from "./checkResult";
import { buildIntegratedCommitProof } from "./integratedCommitProof";
import { verifyIntegratedInput } from "./reviewEvidence";

type Check = "lint-repository" | "typecheck" | "focused-tests" | "package" | "smoke" | "latitude";

const [check, platform, runner] = Bun.argv.slice(2) as [Check, string, string];
const workflowIdentity = readWorkflowIdentity();
const lane = laneForBranch(workflowIdentity.branch);
const plans = await readLanePlans();
const lanePlan = plans.lanes[lane];

const commandPlan: CommandPlan | SmokePlan | undefined = (() => {
	if (check === "lint-repository") return { command: "bun run lint" };
	if (check === "typecheck") return { command: "bun run typecheck && bun run typecheck:repo" };
	if (check === "focused-tests") return lanePlan.focusedTests[platform];
	if (check === "package") return lanePlan.packages[platform];
	if (check === "smoke") return lanePlan.smoke[platform];
	return lanePlan.latitude[platform];
})();

if (!commandPlan) {
	const record = await writeResult(
		{
			check,
			platform,
			runner,
			command: "",
			result: "unverified",
			reason: `The ${lane} lane has no approved ${check} command for ${platform}.`,
		},
		lane,
	);
	await writeStepOutputs(record, false);
	process.exit(1);
}

const requiredInput = commandPlan.integratedInputTicketIdentifier
	? lanePlan.integratedInputs.find(
			(input) => input.ticketIdentifier === commandPlan.integratedInputTicketIdentifier,
		)
	: undefined;
const inputEvidence = requiredInput
	? verifyIntegratedInput(
			requiredInput,
			await buildIntegratedCommitProof(requiredInput, workflowIdentity.commit),
		)
	: undefined;
const missingPaths = missingRequiredPaths(commandPlan.requiredPaths ?? [], existsSync);
if (
	(commandPlan.integratedInputTicketIdentifier && inputEvidence?.verification !== "passed") ||
	missingPaths.length > 0
) {
	const reason = missingPaths.length
		? `The approved command requires missing paths: ${missingPaths.join(", ")}.`
		: `The approved command requires a passed integrated input for ${commandPlan.integratedInputTicketIdentifier}.`;
	const record = await writeResult(
		{
			check,
			platform,
			runner,
			command: commandPlan.command,
			result: "unverified",
			reason,
		},
		lane,
	);
	await writeStepOutputs(record, false);
	process.exit(1);
}

const packageOutput = `evidence/package/${platform}`;
if (check === "package") {
	await mkdir(packageOutput, { recursive: true });
}

const command =
	check === "smoke"
		? [
				"docker",
				"run",
				"--rm",
				"--cpus=2",
				"--memory=4g",
				"--pids-limit=256",
				"--network=none",
				"--read-only",
				"--tmpfs=/tmp:rw,nosuid,nodev,size=256m",
				`--volume=${requiredVariable(process.env, "GITHUB_WORKSPACE")}:/workspace:ro`,
				"--workdir=/workspace",
				(commandPlan as SmokePlan).image,
				"sh",
				"-lc",
				commandPlan.command,
			]
		: ["sh", "-lc", commandPlan.command];

const child = Bun.spawn(command, {
	stdout: "inherit",
	stderr: "inherit",
	env: {
		...process.env,
		TRELLIS_PACKAGE_OUTPUT: packageOutput,
	},
});
const exitCode = await child.exited;
const executedCommand = check === "smoke" ? JSON.stringify(command) : commandPlan.command;

let result: Result = exitCode === 0 ? "passed" : "failed";
let reason = exitCode === 0 ? undefined : `The command exited with code ${exitCode}.`;
if (check === "package" && exitCode === 0 && (await readdir(packageOutput)).length === 0) {
	result = "unverified";
	reason = `The ${lane} package command produced no files for ${platform}.`;
}

const record = await writeResult(
	{
		check,
		platform,
		runner,
		command: executedCommand,
		result,
		reason,
	},
	lane,
);
await writeStepOutputs(record, result === "passed");
process.exit(result === "passed" ? 0 : exitCode || 1);
