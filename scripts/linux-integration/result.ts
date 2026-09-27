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

export function workflowEnvironment() {
	const branch = process.env.GITHUB_REF_NAME ?? "";
	const commit = process.env.GITHUB_SHA ?? "";
	const runId = process.env.GITHUB_RUN_ID ?? "";
	const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? "";
	return {
		repository: process.env.GITHUB_REPOSITORY ?? "",
		workflow: process.env.GITHUB_WORKFLOW ?? "",
		ref: process.env.GITHUB_REF ?? "",
		branch,
		commit,
		runId,
		runAttempt,
	};
}

export async function writeResult(input: ResultInput, lane: CheckRecord["lane"]): Promise<CheckRecord> {
	const environment = workflowEnvironment();
	const record: CheckRecord = {
		schemaVersion: 1,
		...environment,
		lane,
		check: input.check,
		platform: input.platform,
		runner: input.runner,
		os: process.env.RUNNER_OS ?? "",
		architecture: (process.env.RUNNER_ARCH ?? "").toLowerCase(),
		command: input.command,
		result: input.result,
		reason: input.reason,
		artifactName: resultArtifactName({
			lane,
			commit: environment.commit,
			runId: environment.runId,
			runAttempt: environment.runAttempt,
			check: input.check,
			platform: input.platform,
		}),
		createdAt: new Date().toISOString(),
	};
	await mkdir("evidence/results", { recursive: true });
	await Bun.write(`evidence/results/${input.check}-${input.platform}.json`, `${JSON.stringify(record, null, 2)}\n`);
	return record;
}

export async function writeStepOutputs(record: CheckRecord, verified: boolean): Promise<void> {
	const output = process.env.GITHUB_OUTPUT;
	if (!output) return;
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
