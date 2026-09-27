import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import {
	integratedInputEvidence,
	laneForBranch,
	missingRequiredPaths,
	readLanePlans,
	type CommandPlan,
	type Result,
	type SmokePlan,
} from "./contract";
import { workflowEnvironment, writeResult, writeStepOutputs } from "./result";

type Check = "lint-repository" | "typecheck" | "focused-tests" | "package" | "smoke" | "latitude";

const [check, platform, runner] = Bun.argv.slice(2) as [Check, string, string];
const environment = workflowEnvironment();
const lane = laneForBranch(environment.branch);
const plans = await readLanePlans();
const lanePlan = plans.lanes[lane];

const selected: CommandPlan | SmokePlan | undefined = (() => {
	if (check === "lint-repository") return { command: "bun run lint" };
	if (check === "typecheck") return { command: "bun run typecheck && bun run typecheck:repo" };
	if (check === "focused-tests") return lanePlan.focusedTests[platform];
	if (check === "package") return lanePlan.packages[platform];
	if (check === "smoke") return lanePlan.smoke[platform];
	return lanePlan.latitude[platform];
})();

if (!selected) {
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

const requiredInput = selected.integratedInput
	? lanePlan.integratedInputs.find((input) => input.ticketIdentifier === selected.integratedInput)
	: undefined;
const inputEvidence = requiredInput ? integratedInputEvidence(requiredInput) : undefined;
const missingPaths = missingRequiredPaths(selected.requiredPaths ?? [], existsSync);
if ((selected.integratedInput && inputEvidence?.verification !== "passed") || missingPaths.length > 0) {
	const reason = missingPaths.length
		? `The approved command requires missing paths: ${missingPaths.join(", ")}.`
		: `The approved command requires a passed integrated input for ${selected.integratedInput}.`;
	const record = await writeResult(
		{
			check,
			platform,
			runner,
			command: selected.command,
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
				`--volume=${process.env.GITHUB_WORKSPACE ?? process.cwd()}:/workspace:ro`,
				"--workdir=/workspace",
				(selected as SmokePlan).image,
				"sh",
				"-lc",
				selected.command,
			]
		: ["sh", "-lc", selected.command];

const child = Bun.spawn(command, {
	stdout: "inherit",
	stderr: "inherit",
	env: {
		...process.env,
		TRELLIS_PACKAGE_OUTPUT: packageOutput,
	},
});
const exitCode = await child.exited;
const executedCommand = check === "smoke" ? JSON.stringify(command) : selected.command;

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
