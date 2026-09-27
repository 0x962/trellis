import { appendFile, mkdir } from "node:fs/promises";
import {
	type CheckRecord,
	packageArtifactName,
	resultArtifactName,
	type Result,
} from "./contract";

export type ResultInput = {
	check: string;
	platform: string;
	runner: string;
	command: string;
	result: Result;
	reason?: string;
};

export type WorkflowIdentity = {
	repository: string;
	workflow: string;
	ref: string;
	branch: string;
	commit: string;
	runId: string;
	runAttempt: string;
};

export function requiredVariable(
	variables: Record<string, string | undefined>,
	name: string,
): string {
	const value = variables[name];
	if (!value) throw new Error(`The CI variable ${name} is required.`);
	return value;
}

export function readWorkflowIdentity(
	variables: Record<string, string | undefined> = process.env,
): WorkflowIdentity {
	return {
		repository: requiredVariable(variables, "GITHUB_REPOSITORY"),
		workflow: requiredVariable(variables, "GITHUB_WORKFLOW"),
		ref: requiredVariable(variables, "GITHUB_REF"),
		branch: requiredVariable(variables, "GITHUB_REF_NAME"),
		commit: requiredVariable(variables, "GITHUB_SHA"),
		runId: requiredVariable(variables, "GITHUB_RUN_ID"),
		runAttempt: requiredVariable(variables, "GITHUB_RUN_ATTEMPT"),
	};
}

export async function writeResult(input: ResultInput, lane: CheckRecord["lane"]): Promise<CheckRecord> {
	const workflowIdentity = readWorkflowIdentity();
	const record: CheckRecord = {
		schemaVersion: 1,
		...workflowIdentity,
		lane,
		check: input.check,
		platform: input.platform,
		runner: input.runner,
		os: requiredVariable(process.env, "RUNNER_OS"),
		architecture: requiredVariable(process.env, "RUNNER_ARCH").toLowerCase(),
		command: input.command,
		result: input.result,
		reason: input.reason,
		artifactName: resultArtifactName({
			lane,
			commit: workflowIdentity.commit,
			runId: workflowIdentity.runId,
			runAttempt: workflowIdentity.runAttempt,
			check: input.check,
			platform: input.platform,
		}),
		createdAt: new Date().toISOString(),
	};
	await mkdir("evidence/results", { recursive: true });
	await Bun.write(`evidence/results/${input.check}-${input.platform}.json`, `${JSON.stringify(record, null, 2)}\n`);
	console.log(
		JSON.stringify({
			lane: record.lane,
			commit: record.commit,
			check: record.check,
			platform: record.platform,
			result: record.result,
			reason: record.reason ?? "",
			artifactName: record.artifactName,
		}),
	);
	return record;
}

export async function writeStepOutputs(record: CheckRecord, verified: boolean): Promise<void> {
	const output = requiredVariable(process.env, "GITHUB_OUTPUT");
	const packageName = packageArtifactName({
		lane: record.lane,
		commit: record.commit,
		runId: record.runId,
		runAttempt: record.runAttempt,
		platform: record.platform,
	});
	await appendFile(
		output,
		`result_artifact=${record.artifactName}\nverified=${verified}\npackage_artifact=${packageName}\n`,
	);
}
