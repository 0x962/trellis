import { describe, expect, test } from "bun:test";
import { readWorkflowIdentity } from "./checkResult";
import { type CheckRecord, expectedChecks, missingRequiredPaths, resultArtifactName, toEvidenceCheck } from "./contract";
import { applyJobConclusions, type JobConclusions, verifyCheckRecord } from "./evidenceVerification";

describe("Linux integration workflow records", () => {
	test("rejects a missing workflow commit", () => {
		expect(() =>
			readWorkflowIdentity({
				GITHUB_REPOSITORY: "0x962/trellis",
				GITHUB_WORKFLOW: "Linux host integration",
				GITHUB_REF: "refs/heads/integration/linux-verification",
				GITHUB_REF_NAME: "integration/linux-verification",
				GITHUB_RUN_ID: "123",
				GITHUB_RUN_ATTEMPT: "1",
			}),
		).toThrow("GITHUB_SHA");
	});

	test("rejects a record from the wrong runner architecture", () => {
		const expected = expectedChecks.find((check) => check.check === "typecheck" && check.platform === "linux-arm64")!;
		const identity = {
			repository: "0x962/trellis",
			workflow: "Linux host integration",
			ref: "refs/heads/integration/linux-verification",
			branch: "integration/linux-verification",
			commit: "a".repeat(40),
			runId: "123",
			runAttempt: "1",
			lane: "verification" as const,
		};
		const record: CheckRecord = {
			schemaVersion: 1,
			...identity,
			check: expected.check,
			platform: expected.platform,
			runner: expected.runner,
			os: expected.os,
			architecture: "x64",
			command: "bun run typecheck",
			result: "passed",
			artifactName: resultArtifactName({ ...identity, check: expected.check, platform: expected.platform }),
			createdAt: "2026-09-27T00:00:00.000Z",
		};
		expect(verifyCheckRecord(record, expected, identity).result).toBe("failed");
	});

	test("fails passed package records when the package job fails", () => {
		const record = { check: "package", result: "passed" } as CheckRecord;
		const conclusions: JobConclusions = {
			plan: "success",
			lint: "success",
			typecheck: "success",
			focusedTests: "success",
			package: "failure",
			smoke: "success",
			latitude: "success",
		};
		expect(applyJobConclusions([record], conclusions)[0]?.result).toBe("failed");
	});

	test("serializes the public evidence check schema", () => {
		const record = {
			check: "package",
			platform: "linux-x64",
			runner: "ubuntu-24.04",
			command: "bun scripts/host-release/build.ts",
			result: "unverified",
			artifactName: "trellis-ci-verification-commit-123-1-package-linux-x64",
		} as CheckRecord;
		const serialized = JSON.parse(JSON.stringify(toEvidenceCheck(record)));

		expect(serialized).toEqual({
			name: "package",
			platform: "linux-x64",
			runner: "ubuntu-24.04",
			command: "bun scripts/host-release/build.ts",
			conclusion: "unverified",
			artifactName: "trellis-ci-verification-commit-123-1-package-linux-x64",
		});
		expect(serialized).not.toHaveProperty("check");
		expect(serialized).not.toHaveProperty("result");
	});

	test("reports a required source path that is absent", () => {
		const paths = ["apps/server/src/services/systemUsage/linux", "present"];
		expect(missingRequiredPaths(paths, (path) => path === "present")).toEqual([
			"apps/server/src/services/systemUsage/linux",
		]);
	});
});
