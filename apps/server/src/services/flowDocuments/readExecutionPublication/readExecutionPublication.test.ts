import { expect, test } from "bun:test";
import { protocolDigest } from "../../../langflowContracts";
import { retainedPublication } from "./fixture";
import { type RetainedExecutionPublication, readExecutionPublication } from "./readExecutionPublication";

test("reads retained graph bytes without the source flow or a current draft", () => {
	const execution = retainedPublication();
	const result = readExecutionPublication(execution);
	expect(result.snapshot.flow.slug).toBe("original-name");
	expect(result.graphDocument.trellisRequestSpecsV1).toEqual({
		vertex: { instruction: "  Keep\nexact bytes.  " },
	});
	expect(result.publication).toEqual(execution.publication);
});

test("checks the digest of original submission bytes without canonical reconstruction", () => {
	const execution = retainedPublication();
	execution.submissionBytes = JSON.stringify(JSON.parse(execution.submissionBytes), null, 2);
	execution.submission.submissionDigest = protocolDigest(execution.submissionBytes);
	expect(readExecutionPublication(execution).snapshot).toEqual(execution.snapshot);
});

const conflicts: [string, (execution: RetainedExecutionPublication) => void][] = [
	[
		"execution identity",
		(e) => {
			e.executionId = "different-execution";
		},
	],
	[
		"flow identity",
		(e) => {
			e.flowId = "different-flow";
		},
	],
	[
		"publication identity",
		(e) => {
			e.publicationId = "different-publication";
		},
	],
	[
		"submission publication",
		(e) => {
			e.submission.publicationId = "different-publication";
		},
	],
	[
		"revision",
		(e) => {
			e.publication.revision++;
		},
	],
	[
		"metadata version",
		(e) => {
			e.snapshot.flow.version++;
		},
	],
	[
		"document hash",
		(e) => {
			e.publication.documentHash = "d".repeat(64);
		},
	],
	[
		"manifest hash",
		(e) => {
			e.publication.componentManifestHash = "d".repeat(64);
		},
	],
	[
		"submission digest",
		(e) => {
			e.submission.submissionDigest = "d".repeat(64);
		},
	],
	[
		"changed retained metadata",
		(e) => {
			e.snapshot.flow.briefing = "Changed";
		},
	],
	[
		"changed retained graph",
		(e) => {
			e.snapshot.graphDocument.nodes = [{ id: "new" }];
		},
	],
	[
		"changed payload with recomputed digest",
		(e) => {
			const payload = JSON.parse(e.submissionBytes);
			payload.snapshot.flow.briefing = "Changed";
			e.submissionBytes = JSON.stringify(payload);
			e.submission.submissionDigest = protocolDigest(e.submissionBytes);
		},
	],
];

test.each(conflicts)("refuses %s", (_name, corrupt) => {
	const execution = retainedPublication();
	corrupt(execution);
	expect(() => readExecutionPublication(execution)).toThrow("execution_publication_conflict");
});
