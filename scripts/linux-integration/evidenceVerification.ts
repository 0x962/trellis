import {
	type CheckRecord,
	expectedChecks,
	type Lane,
	resultArtifactName,
	type Result,
} from "./contract";
import type { WorkflowIdentity } from "./checkResult";

export type JobConclusions = {
	plan: string;
	lint: string;
	typecheck: string;
	focusedTests: string;
	package: string;
	smoke: string;
	latitude: string;
};

type ExpectedCheck = (typeof expectedChecks)[number];
type EvidenceIdentity = WorkflowIdentity & { lane: Lane };

export function verifyCheckRecord(
	record: CheckRecord,
	expected: ExpectedCheck,
	identity: EvidenceIdentity,
): CheckRecord {
	const expectedArtifactName = resultArtifactName({
		lane: identity.lane,
		commit: identity.commit,
		runId: identity.runId,
		runAttempt: identity.runAttempt,
		check: expected.check,
		platform: expected.platform,
	});
	const fields = [
		["repository", record.repository, identity.repository],
		["workflow", record.workflow, identity.workflow],
		["ref", record.ref, identity.ref],
		["branch", record.branch, identity.branch],
		["lane", record.lane, identity.lane],
		["commit", record.commit, identity.commit],
		["runId", record.runId, identity.runId],
		["runAttempt", record.runAttempt, identity.runAttempt],
		["check", record.check, expected.check],
		["platform", record.platform, expected.platform],
		["runner", record.runner, expected.runner],
		["os", record.os, expected.os],
		["architecture", record.architecture, expected.architecture],
		["artifactName", record.artifactName, expectedArtifactName],
	] as const;
	const missing = fields.filter((field) => !field[1]).map((field) => field[0]);
	if (missing.length > 0) {
		return {
			...record,
			result: "unverified",
			reason: `The result record omits required fields: ${missing.join(", ")}.`,
		};
	}
	const mismatches = fields
		.filter((field) => field[1] !== field[2])
		.map((field) => `${field[0]} expected ${field[2]} but recorded ${field[1]}`);
	if (mismatches.length > 0) {
		return {
			...record,
			result: "failed",
			reason: `The result record does not match: ${mismatches.join("; ")}.`,
		};
	}
	if (!(["passed", "failed", "unverified"] as Result[]).includes(record.result)) {
		return {
			...record,
			result: "unverified",
			reason: `The result record has an unknown result: ${record.result}.`,
		};
	}
	return record;
}

function conclusionForCheck(check: string, conclusions: JobConclusions): string {
	if (check === "plan-identity") return conclusions.plan;
	if (check === "lint-repository") return conclusions.lint;
	if (check === "typecheck") return conclusions.typecheck;
	if (check === "focused-tests") return conclusions.focusedTests;
	if (check === "package") return conclusions.package;
	if (check === "smoke") return conclusions.smoke;
	return conclusions.latitude;
}

export function applyJobConclusions(
	records: CheckRecord[],
	conclusions: JobConclusions,
): CheckRecord[] {
	return records.map((record) => {
		const conclusion = conclusionForCheck(record.check, conclusions);
		if (conclusion === "success") return record;
		return {
			...record,
			result: conclusion === "failure" ? "failed" : "unverified",
			reason: [
				`GitHub reported ${conclusion} for the ${record.check} job.`,
				record.reason,
			]
				.filter(Boolean)
				.join(" "),
		};
	});
}

export function allJobsSucceeded(conclusions: JobConclusions): boolean {
	return Object.values(conclusions).every((conclusion) => conclusion === "success");
}
