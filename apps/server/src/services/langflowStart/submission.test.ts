import { expect, test } from "bun:test";
import { protocolDigest, SubmissionV1Schema } from "../../langflowContracts";
import { fixture } from "./fixture.ts";
import { requestBytes } from "./requestBytes.ts";
import { submissionEnvelope } from "./submissionEnvelope.ts";

test("the payload digest covers the exact stored bytes", () => {
	const f = fixture();
	const wire = SubmissionV1Schema.parse(JSON.parse(submissionEnvelope(f.initial)));
	expect(wire.submissionDigest).toBe(protocolDigest(f.initial.submissionBytes));
	expect(wire.requestDigest).toBe(protocolDigest(f.initial.requestBytes));
	expect(wire.admission.state).toBe("closed");
});

test("an unknown response preserves the original wire bytes", () => {
	const f = fixture();
	const before = submissionEnvelope(f.initial);
	f.initial.submission.state = "submission_unknown";
	f.initial.submission.revision += 1;
	expect(submissionEnvelope(f.initial)).toBe(before);
});

test("request identity uses validated fields and preserves text content", () => {
	const f = fixture();
	const first = { ...f.input, allowRepeat: true, repeatReason: "A reason with  two spaces." };
	const reordered = {
		requestId: first.requestId,
		repeatReason: first.repeatReason,
		allowRepeat: true,
		expectedVersion: first.expectedVersion,
		ticket: first.ticket,
		flow: first.flow,
	};
	expect(requestBytes(first)).toBe(requestBytes(reordered));
	expect(JSON.parse(requestBytes(first)).repeatReason).toBe(first.repeatReason);
	expect(requestBytes({ ...first, repeatReason: "A reason with one space." })).not.toBe(requestBytes(first));
});
