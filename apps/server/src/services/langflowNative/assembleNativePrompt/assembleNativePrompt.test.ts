import { expect, test } from "bun:test";
import { protocolDigest } from "../../../langflowContracts";
import { assembleNativePrompt } from "./assembleNativePrompt";
import { promptFixture } from "./fixture";

test("retains the briefing, target, static instruction, ordered outputs, and receipt bytes", () => {
	const feedback = JSON.stringify({ decision: "no", output: "Feedback\n".repeat(150_000) });
	const { execution, request, approved } = promptFixture(["native output", feedback]);
	const before = structuredClone(approved);
	const prompt = assembleNativePrompt(execution, request, approved);
	expect(prompt.instruction).toContain("Retained briefing\n\nFlow target:");
	expect(prompt.instruction).toContain('"ticketId":"retained-ticket"');
	expect(prompt.instruction).toContain(`"reviewedHead":"${execution.reviewedHead}"`);
	expect(prompt.instruction).toContain(approved.instruction);
	const inputs = JSON.parse(prompt.instruction.split("Prior step outputs:\n")[1]!);
	expect(inputs).toEqual([
		{ key: "visit-0", nodeId: "source-0", output: "native output" },
		{ key: "visit-1", nodeId: "source-1", output: feedback },
	]);
	expect(prompt.provenance.inputReceipts).toEqual(approved.inputReceipts);
	expect(prompt.provenance.instructionDigest).toBe(protocolDigest(prompt.instruction));
	expect(approved).toEqual(before);
	expect(JSON.parse(JSON.stringify(prompt))).toEqual(prompt);
});

test("refuses missing, reordered, changed, and foreign receipts", () => {
	const fixture = promptFixture();
	for (const inputReceipts of [fixture.approved.inputReceipts.slice(1), [...fixture.approved.inputReceipts].reverse()])
		expect(() =>
			assembleNativePrompt(fixture.execution, fixture.request, { ...fixture.approved, inputReceipts }),
		).toThrow();
	for (const field of ["receiptId", "executionId", "publicationId", "engineJobId"]) {
		const { execution, request, approved } = promptFixture();
		const receipt = approved.inputReceipts[0]!;
		receipt.receiptBytes = JSON.stringify({ ...JSON.parse(receipt.receiptBytes), [field]: "foreign" });
		receipt.receiptDigest = protocolDigest(receipt.receiptBytes);
		expect(() => assembleNativePrompt(execution, request, approved)).toThrow("native_prompt_receipt_conflict");
	}
	fixture.approved.inputReceipts[0]!.receiptBytes += " ";
	expect(() => assembleNativePrompt(fixture.execution, fixture.request, fixture.approved)).toThrow(
		"native_prompt_receipt_conflict",
	);
});

test("refuses replacement instructions, accounts, harness settings, and task associations", () => {
	const { execution, request, approved } = promptFixture();
	for (const changed of [
		{ ...approved, instruction: "Runtime replacement" },
		{ ...approved, accountId: "new-account" },
		{ ...approved, harness: { ...approved.harness, effort: "low" as const } },
		{ ...approved, taskKey: "another-visit" },
		{ ...approved, engineNodeId: "missing-vertex" },
	])
		expect(() => assembleNativePrompt(execution, request, changed)).toThrow();
	execution.snapshot.flow.briefing = "Mutable briefing";
	expect(() => assembleNativePrompt(execution, request, approved)).toThrow("execution_publication_conflict");
});

test("requires conversion provenance when the retained graph declares a conversion", () => {
	const { execution, request, approved } = promptFixture();
	if (execution.snapshot.engine !== "langflow") throw new Error("fixture_engine");
	execution.snapshot.graphDocument.trellisConversionV1 = {};
	execution.submissionBytes = JSON.stringify({ publication: execution.publication, snapshot: execution.snapshot });
	execution.submission.submissionDigest = protocolDigest(execution.submissionBytes);
	expect(() => assembleNativePrompt(execution, request, approved)).toThrow();
});

test("appends the exact condition directive for a nested loop visit", () => {
	const { execution, request, approved } = promptFixture([]);
	request.phase = "condition";
	request.iterationPath.push({ loopNodeId: "inner", round: 502 });
	approved.taskKey = JSON.stringify([
		"review",
		request.nodeId,
		request.parentOccurrenceKey,
		request.phase,
		request.iterationPath.map(({ loopNodeId, round }) => [loopNodeId, round]),
	]);
	approved.requestDigest = protocolDigest(JSON.stringify(request));
	const prompt = assembleNativePrompt(execution, request, approved);
	expect(prompt.instruction).toEndWith("Answer the condition with exactly YES or NO as the complete final response.");
	expect(prompt.instruction).toContain("Prior step outputs:\n[]");
});
