import type { EvidenceCheck } from "@trellis/api";

export const currentCheck = (
	check: Omit<EvidenceCheck, "current">,
	state: { head: string; fingerprint: string; attemptId: string },
) => ({
	...check,
	current:
		check.attemptId === state.attemptId &&
		check.head === state.head &&
		check.fingerprint === state.fingerprint &&
		(check.finishedFingerprint === null || check.finishedFingerprint === state.fingerprint),
});
