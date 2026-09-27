import { appendFile, mkdir, readdir } from "node:fs/promises";
import { readWorkflowIdentity, requiredVariable } from "./checkResult";
import {
	type CheckRecord,
	evidenceArtifactName,
	expectedChecks,
	laneForBranch,
	readLanePlans,
	resultArtifactName,
	toEvidenceCheck,
	type Result,
} from "./contract";
import {
	allJobsSucceeded,
	applyJobConclusions,
	type JobConclusions,
	verifyCheckRecord,
} from "./evidenceVerification";
import {
	readIntegratedCommitProof,
	readLaneReviewCoverageProof,
} from "./integratedCommitProof";
import {
	findIntegratedInputGaps,
	verifyIntegratedInput,
	verifyLaneReview,
	verifyLaneReviewCoverage,
} from "./reviewEvidence";

async function listJsonFiles(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const entryPath = `${path}/${entry.name}`;
			return entry.isDirectory()
				? listJsonFiles(entryPath)
				: Promise.resolve(entryPath.endsWith(".json") ? [entryPath] : []);
		}),
	);
	return files.flat();
}

function checkRecordKey(record: Pick<CheckRecord, "check" | "platform">): string {
	return `${record.check}:${record.platform}`;
}

function aggregateResults(results: Result[]): Result {
	if (results.includes("failed")) return "failed";
	if (results.includes("unverified")) return "unverified";
	return "passed";
}

const inputPath = Bun.argv[2] ?? "evidence/downloaded";
const outputPath = Bun.argv[3] ?? "evidence/index";
const workflowIdentity = readWorkflowIdentity();
const lane = laneForBranch(workflowIdentity.branch);
const lanePlans = await readLanePlans();
const lanePlan = lanePlans.lanes[lane];
const laneReview = verifyLaneReview(
	lanePlan.laneReview,
	await readIntegratedCommitProof(lanePlan.laneReview, workflowIdentity.commit),
);
const integratedInputs = await Promise.all(
	lanePlan.integratedInputs.map(async (input) =>
		({
			...verifyIntegratedInput(
				input,
				await readIntegratedCommitProof(input, workflowIdentity.commit),
			),
			laneReviewCoverage: verifyLaneReviewCoverage(
				laneReview,
				await readLaneReviewCoverageProof(input, lanePlan.laneReview),
			),
		}),
	),
);
const integrationGaps = [
	...findIntegratedInputGaps(integratedInputs),
	...(!laneReview || laneReview.verification === "passed"
		? []
		: [{ verification: laneReview.verification, reason: laneReview.reason ?? "The lane review is incomplete." }]),
	...integratedInputs
		.filter((input) => input.verification !== "passed")
		.map((input) => ({
			verification: input.verification === "failed" ? ("failed" as const) : ("unverified" as const),
			reason: `${input.ticketIdentifier || "An integrated input"}: ${input.reason ?? "Review proof is incomplete."}`,
		})),
	...integratedInputs
		.filter(
			(input) => input.laneReviewCoverage && input.laneReviewCoverage.verification !== "passed",
		)
		.map((input) => ({
			verification:
				input.laneReviewCoverage?.verification === "failed"
					? ("failed" as const)
					: ("unverified" as const),
			reason: `${input.ticketIdentifier}: ${input.laneReviewCoverage?.reason ?? "Lane review coverage is incomplete."}`,
		})),
];

const records = new Map<string, CheckRecord>();
await mkdir(inputPath, { recursive: true });
for (const file of await listJsonFiles(inputPath)) {
	const record = (await Bun.file(file).json()) as CheckRecord;
	records.set(checkRecordKey(record), record);
}

const identity = { ...workflowIdentity, lane };
const recordedChecks = expectedChecks.map((expected): CheckRecord => {
	const record = records.get(checkRecordKey(expected));
	if (record) return verifyCheckRecord(record, expected, identity);
	return {
		schemaVersion: 1,
		...workflowIdentity,
		lane,
		check: expected.check,
		platform: expected.platform,
		runner: expected.runner,
		os: expected.os,
		architecture: expected.architecture,
		command: "",
		result: "unverified",
		reason:
			expected.check === "latitude"
				? "The protected Latitude runner is inactive or unavailable."
				: "The job produced no result artifact.",
		artifactName: resultArtifactName({
			lane,
			commit: workflowIdentity.commit,
			runId: workflowIdentity.runId,
			runAttempt: workflowIdentity.runAttempt,
			check: expected.check,
			platform: expected.platform,
		}),
		createdAt: new Date().toISOString(),
	};
});

const jobConclusions: JobConclusions = {
	plan: requiredVariable(process.env, "PLAN_RESULT"),
	lint: requiredVariable(process.env, "LINT_RESULT"),
	typecheck: requiredVariable(process.env, "TYPECHECK_RESULT"),
	focusedTests: requiredVariable(process.env, "TEST_RESULT"),
	package: requiredVariable(process.env, "PACKAGE_RESULT"),
	smoke: requiredVariable(process.env, "SMOKE_RESULT"),
	latitude: requiredVariable(process.env, "LATITUDE_RESULT"),
};
const checks = applyJobConclusions(recordedChecks, jobConclusions);
const evidenceChecks = checks.map(toEvidenceCheck);
const platforms = [...new Set(checks.map((check) => check.platform))].map((platform) => {
	const platformChecks = checks.filter((check) => check.platform === platform);
	return {
		platform,
		architecture: platformChecks[0]!.architecture,
		verification: aggregateResults(platformChecks.map((check) => check.result)),
		reason: platformChecks.find((check) => check.result !== "passed")?.reason,
	};
});
const complete =
	allJobsSucceeded(jobConclusions) &&
	integratedInputs.length > 0 &&
	(!laneReview || laneReview.verification === "passed") &&
	integratedInputs.every(
		(input) => !input.laneReviewCoverage || input.laneReviewCoverage.verification === "passed",
	) &&
	checks.every((check) => check.result === "passed") &&
	integratedInputs.every((input) => input.verification === "passed");
const index = {
	schemaVersion: 1,
	...workflowIdentity,
	lane,
	createdAt: new Date().toISOString(),
	jobConclusions,
	laneReview,
	integratedInputs,
	integrationGaps,
	checks: evidenceChecks,
	platforms,
};

const laneFindings =
	(laneReview?.findings ?? [])
		.map((finding) => `${finding.id}: ${finding.status}: ${finding.resolution}`)
		.join("; ") || "none";
const markdown = [
	"# Linux host integration evidence",
	"",
	`- Branch: \`${workflowIdentity.branch}\``,
	`- Commit: \`${workflowIdentity.commit}\``,
	`- Run: \`${workflowIdentity.runId}\``,
	`- Attempt: \`${workflowIdentity.runAttempt}\``,
	"",
	"## Lane review",
	"",
	"| Diff | Reviewed head | Source head | Lane commit | Review run | Review result | Findings | Verification | Reason |",
	"|---|---|---|---|---|---|---|---|---|",
	...(laneReview
		? [
				`| ${laneReview.diffUrl} | ${laneReview.reviewedHead} | ${laneReview.sourceHead} | ${laneReview.laneCommit} | ${laneReview.reviewRunId} | ${laneReview.reviewResult} | ${laneFindings} | ${laneReview.verification} | ${laneReview.reason ?? ""} |`,
			]
		: ["| none |  |  |  |  |  |  |  |  |"]),
	"",
	"## Integrated inputs",
	"",
	"| Feature ticket | Feature ticket ID | Checkpoint ticket | Checkpoint ticket ID | Diff | Reviewed head | Source head | Lane commit | Review run | Review result | Findings | Lane coverage | Verification | Reason |",
	"|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
	...integratedInputs.map((input) => {
		const findings =
			input.findings
				.map((finding) => `${finding.id}: ${finding.status}: ${finding.resolution}`)
				.join("; ") || "none";
		return `| ${input.ticketIdentifier} | ${input.ticketId} | ${input.checkpointTicketIdentifier} | ${input.checkpointTicketId} | ${input.diffUrl} | ${input.reviewedHead} | ${input.sourceHead} | ${input.laneCommit} | ${input.reviewRunId} | ${input.reviewResult} | ${findings} | ${input.laneReviewCoverage?.verification ?? "none"} | ${input.verification} | ${input.reason ?? ""} |`;
	}),
	"",
	"## Integration gaps",
	"",
	...(integrationGaps.length > 0
		? integrationGaps.map((gap) => `- ${gap.verification}: ${gap.reason}`)
		: ["- none"]),
	"",
	"## Checks",
	"",
	"| Check | Platform | Runner | OS | Architecture | Command | Result | Reason |",
	"|---|---|---|---|---|---|---|---|",
	...checks.map(
		(check) =>
			`| ${check.check} | ${check.platform} | ${check.runner} | ${check.os} | ${check.architecture} | ${check.command || "none"} | ${check.result} | ${check.reason ?? ""} |`,
	),
	"",
	"## Platform gaps",
	"",
	...platforms
		.filter((platform) => platform.verification !== "passed")
		.map(
			(platform) =>
				`- ${platform.platform}: ${platform.verification}. ${platform.reason ?? "No result artifact exists."}`,
		),
	"",
].join("\n");

await mkdir(outputPath, { recursive: true });
await Bun.write(`${outputPath}/evidence.json`, `${JSON.stringify(index, null, 2)}\n`);
await Bun.write(`${outputPath}/evidence.md`, markdown);
await appendFile(
	requiredVariable(process.env, "GITHUB_OUTPUT"),
	[
		`artifact=${evidenceArtifactName({
			lane,
			commit: workflowIdentity.commit,
			runId: workflowIdentity.runId,
			runAttempt: workflowIdentity.runAttempt,
		})}`,
		`complete=${complete}`,
		"",
	].join("\n"),
);
