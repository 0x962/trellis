import { describe, expect, test } from "bun:test";
import { evidenceArtifactName, packageArtifactName, resultArtifactName } from "./contract";

describe("Linux integration artifact names", () => {
	test("includes the run and attempt in every artifact name", () => {
		const identity = {
			lane: "verification" as const,
			commit: "a".repeat(40),
			runId: "123",
			runAttempt: "2",
		};
		expect(resultArtifactName({ ...identity, check: "typecheck", platform: "linux-x64" })).toBe(
			`trellis-ci-verification-${"a".repeat(40)}-123-2-typecheck-linux-x64`,
		);
		expect(packageArtifactName({ ...identity, platform: "linux-x64" })).toBe(
			`trellis-package-verification-${"a".repeat(40)}-123-2-linux-x64`,
		);
		expect(evidenceArtifactName(identity)).toBe(`trellis-evidence-verification-${"a".repeat(40)}-123-2`);
	});
});
