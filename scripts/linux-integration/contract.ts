import type { IntegratedInputPlan, LaneReviewPlan } from "./reviewEvidence";

export const integrationBranches = {
	"integration/linux-host": "host",
	"integration/linux-connection": "connection",
	"integration/linux-client": "client",
	"integration/linux-operations": "operations",
	"integration/linux-verification": "verification",
	"integration/linux-system": "system",
} as const;

type IntegrationBranch = keyof typeof integrationBranches;
export type Lane = (typeof integrationBranches)[IntegrationBranch];
export type Result = "passed" | "failed" | "unverified";

export type CommandPlan = {
	command: string;
	integratedInputTicketIdentifier?: string;
	requiredPaths?: string[];
};

type PackagePlan = CommandPlan;

export type SmokePlan = CommandPlan & {
	image: string;
};

type LanePlan = {
	integratedInputs: IntegratedInputPlan[];
	laneReview: LaneReviewPlan | null;
	focusedTests: Partial<Record<string, CommandPlan>>;
	packages: Partial<Record<string, PackagePlan>>;
	smoke: Partial<Record<string, SmokePlan>>;
	latitude: Partial<Record<string, CommandPlan>>;
};

type LanePlans = {
	schemaVersion: 1;
	lanes: Record<Lane, LanePlan>;
};

export type CheckRecord = {
	schemaVersion: 1;
	repository: string;
	workflow: string;
	runId: string;
	runAttempt: string;
	ref: string;
	branch: string;
	lane: Lane;
	commit: string;
	check: string;
	platform: string;
	runner: string;
	os: string;
	architecture: string;
	command: string;
	result: Result;
	reason?: string;
	artifactName: string;
	createdAt: string;
};

type EvidenceCheck = {
	name: string;
	platform: string;
	runner: string;
	command: string;
	conclusion: Result;
	artifactName: string;
};

export function toEvidenceCheck(record: CheckRecord): EvidenceCheck {
	return {
		name: record.check,
		platform: record.platform,
		runner: record.runner,
		command: record.command,
		conclusion: record.result,
		artifactName: record.artifactName,
	};
}

const hostedPlatforms = [
	{ platform: "linux-x64", runner: "ubuntu-24.04", os: "Linux", architecture: "x64" },
	{ platform: "linux-arm64", runner: "ubuntu-24.04-arm", os: "Linux", architecture: "arm64" },
	{ platform: "macos-x64", runner: "macos-15-intel", os: "macOS", architecture: "x64" },
	{ platform: "macos-arm64", runner: "macos-15", os: "macOS", architecture: "arm64" },
] as const;

const smokePlatforms = [
	{ platform: "debian-x64", runner: "ubuntu-24.04", os: "Linux", architecture: "x64" },
	{ platform: "rocky-x64", runner: "ubuntu-24.04", os: "Linux", architecture: "x64" },
	{ platform: "alpine-x64", runner: "ubuntu-24.04", os: "Linux", architecture: "x64" },
] as const;

const latitudePlatform = {
	platform: "protected-x64",
	runner: "self-hosted,linux,x64,trellis-latitude",
	os: "Linux",
	architecture: "x64",
} as const;

export const expectedChecks = [
	{ check: "plan-identity", ...hostedPlatforms[0] },
	{ check: "lint-repository", ...hostedPlatforms[0] },
	...hostedPlatforms.map((platform) => ({ check: "typecheck", ...platform })),
	...hostedPlatforms.map((platform) => ({ check: "focused-tests", ...platform })),
	...hostedPlatforms.map((platform) => ({ check: "package", ...platform })),
	...smokePlatforms.map((platform) => ({ check: "smoke", ...platform })),
	{ check: "latitude", ...latitudePlatform },
] as const;

export function laneForBranch(branch: string): Lane {
	const lane = integrationBranches[branch as IntegrationBranch];
	if (!lane) {
		throw new Error(`The branch ${branch} is not a Linux integration branch.`);
	}
	return lane;
}

export function resultArtifactName(input: {
	lane: Lane;
	commit: string;
	runId: string;
	runAttempt: string;
	check: string;
	platform: string;
}): string {
	return `trellis-ci-${input.lane}-${input.commit}-${input.runId}-${input.runAttempt}-${input.check}-${input.platform}`;
}

export function packageArtifactName(input: {
	lane: Lane;
	commit: string;
	runId: string;
	runAttempt: string;
	platform: string;
}): string {
	return `trellis-package-${input.lane}-${input.commit}-${input.runId}-${input.runAttempt}-${input.platform}`;
}

export function evidenceArtifactName(input: {
	lane: Lane;
	commit: string;
	runId: string;
	runAttempt: string;
}): string {
	return `trellis-evidence-${input.lane}-${input.commit}-${input.runId}-${input.runAttempt}`;
}

export function missingRequiredPaths(
	paths: string[],
	exists: (path: string) => boolean,
): string[] {
	return paths.filter((path) => !exists(path));
}

export async function readLanePlans(): Promise<LanePlans> {
	return (await Bun.file(new URL("./lanes.json", import.meta.url)).json()) as LanePlans;
}
