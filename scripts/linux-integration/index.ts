import { appendFile, mkdir, readdir } from "node:fs/promises";
import {
	type CheckRecord,
	evidenceArtifactName,
	expectedChecks,
	integratedInputEvidence,
	integratedInputGaps,
	laneForBranch,
	readLanePlans,
	type Result,
} from "./contract";
import { workflowEnvironment } from "./result";

async function jsonFiles(path: string): Promise<string[]> {
	const entries = await readdir(path, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const entryPath = `${path}/${entry.name}`;
			return entry.isDirectory() ? jsonFiles(entryPath) : Promise.resolve(entryPath.endsWith(".json") ? [entryPath] : []);
		}),
	);
	return files.flat();
}

function keyOf(record: Pick<CheckRecord, "check" | "platform">): string {
	return `${record.check}:${record.platform}`;
}

function aggregate(results: Result[]): Result {
	if (results.includes("failed")) return "failed";
	if (results.includes("unverified")) return "unverified";
	return "passed";
}

const inputPath = Bun.argv[2] ?? "evidence/downloaded";
const outputPath = Bun.argv[3] ?? "evidence/index";
const environment = workflowEnvironment();
const lane = laneForBranch(environment.branch);
const lanePlans = await readLanePlans();
const integratedInputs = lanePlans.lanes[lane].integratedInputs.map(integratedInputEvidence);
const integrationGaps = integratedInputGaps(integratedInputs);
const records = new Map<string, CheckRecord>();

await mkdir(inputPath, { recursive: true });
for (const file of await jsonFiles(inputPath)) {
	const record = (await Bun.file(file).json()) as CheckRecord;
	records.set(keyOf(record), record);
}

const checks = expectedChecks.map((expected): CheckRecord => {
	const record = records.get(keyOf(expected));
	if (record) return record;
	const latitude = expected.check === "latitude";
	return {
		schemaVersion: 1,
		...environment,
		lane,
		check: expected.check,
		platform: expected.platform,
		runner: expected.runner,
		os: expected.os,
		architecture: expected.architecture,
		command: "",
		result: "unverified",
		reason: latitude
			? "The protected Latitude runner is inactive or unavailable."
			: "The job produced no result artifact.",
		artifactName: "",
		createdAt: new Date().toISOString(),
	};
});

const platforms = [...new Set(checks.map((check) => check.platform))].map((platform) => {
	const platformChecks = checks.filter((check) => check.platform === platform);
	const verification = aggregate(platformChecks.map((check) => check.result));
	return {
		platform,
		architecture: platformChecks[0]!.architecture,
		verification,
		reason: platformChecks.find((check) => check.result !== "passed")?.reason,
	};
});

const jobConclusions = {
	plan: process.env.PLAN_RESULT ?? "",
	lint: process.env.LINT_RESULT ?? "",
	typecheck: process.env.TYPECHECK_RESULT ?? "",
	focusedTests: process.env.TEST_RESULT ?? "",
	package: process.env.PACKAGE_RESULT ?? "",
	smoke: process.env.SMOKE_RESULT ?? "",
	latitude: process.env.LATITUDE_RESULT ?? "",
};
const complete =
	integratedInputs.length > 0 &&
	checks.every((check) => check.result === "passed") &&
	integratedInputs.every((input) => input.verification === "passed");
const index = {
	schemaVersion: 1,
	...environment,
	lane,
	createdAt: new Date().toISOString(),
	jobConclusions,
	integratedInputs,
	integrationGaps,
	checks,
	platforms,
};
const markdown = [
	"# Linux host integration evidence",
	"",
	`- Branch: \`${environment.branch}\``,
	`- Commit: \`${environment.commit}\``,
	`- Run: \`${environment.runId}\``,
	`- Attempt: \`${environment.runAttempt}\``,
	"",
	"## Integrated inputs",
	"",
	[
		"| Ticket | Ticket ID | Diff | Reviewed commit | Integrated commit |",
		" Review run | Review result | Findings | Verification | Reason |",
	].join(""),
	"|---|---|---|---|---|---|---|---|---|---|",
	...integratedInputs.map(
		(input) => {
			const findings =
				input.findings
					.map((finding) => `${finding.id}: ${finding.status}: ${finding.resolution}`)
					.join("; ") || "none";
			return [
				`| ${input.ticketIdentifier} | ${input.ticketId} | ${input.diffUrl} |`,
				` ${input.commit} | ${input.integratedCommit} | ${input.reviewRunId} |`,
				` ${input.reviewResult} | ${findings} | ${input.verification} | ${input.reason ?? ""} |`,
			].join("");
		},
	),
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
		(check) => {
			return [
				`| ${check.check} | ${check.platform} | ${check.runner} | ${check.os} |`,
				` ${check.architecture} | ${check.command || "none"} | ${check.result} | ${check.reason ?? ""} |`,
			].join("");
		},
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

const output = process.env.GITHUB_OUTPUT;
if (output) {
	await appendFile(
		output,
		[
			`artifact=${evidenceArtifactName({
				lane,
				commit: environment.commit,
				runId: environment.runId,
				runAttempt: environment.runAttempt,
			})}`,
			`complete=${complete}`,
			"",
		].join("\n"),
	);
}
