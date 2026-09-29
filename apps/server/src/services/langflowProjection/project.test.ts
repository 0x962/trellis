import { describe, expect, test } from "bun:test";
import { FlowExecutionViewV1Schema } from "@trellis/api";
import { protocolDigest } from "../../langflowContracts";
import { project } from "./project.ts";
import { fixture } from "./testFixture.ts";

const run = (f: ReturnType<typeof fixture>) =>
	project(f.view, f.observed, f.facts, f.binding, f.view.lastEventSeq + 1, f.now);

describe("durable occurrence projection", () => {
	test("accepted native result preserves exact attempt, output and frozen graph", () => {
		const f = fixture();
		const result = run(f);
		expect(result.status).toBe("succeeded");
		expect(result.snapshot).toEqual(f.view.snapshot);
		expect(result.reviewedHead).toBe(f.view.reviewedHead);
		expect(result.occurrences[0]!.output).toBe("YES\n");
		expect(result.occurrences[0]!.outputSource).toMatchObject({
			attemptId: f.facts.native[0]!.handle.attemptId,
			resultId: "result-1",
		});
		expect(FlowExecutionViewV1Schema.safeParse(result).success).toBe(true);
	});
	test("engine completion alone cannot accept native output", () => {
		const f = fixture();
		f.facts.native[0]!.completion!.receipt = null;
		const result = run(f);
		expect(result.status).toBe("waiting");
		expect(result.detail).toBe("unknown");
		expect(result.occurrences[0]!.output).toBe("YES\n");
	});
	test("wrong completion digest cannot grant success", () => {
		const f = fixture();
		f.facts.native[0]!.completion!.receipt!.resultDigest = "0".repeat(64);
		expect(run(f).status).toBe("waiting");
	});
	test("old snapshot revision and stale owner cannot replace current state", () => {
		const f = fixture();
		f.observed.expectedRevision--;
		expect(() => run(f)).toThrow("projection_conflict");
		f.observed.expectedRevision++;
		f.observed.checkpoint.engineEpoch++;
		expect(() => run(f)).toThrow("stale_owner");
	});
	test("a delayed running snapshot cannot change a completed occurrence", () => {
		const f = fixture();
		f.view = run(f);
		f.observed.expectedRevision = f.view.revision;
		f.observed.status = "running";
		f.observed.occurrences[0]!.state = "running";
		expect(() => run(f)).toThrow("stale_snapshot");
	});
	test("a snapshot cannot discard retained history", () => {
		const f = fixture();
		f.view = run(f);
		f.observed.expectedRevision = f.view.revision;
		f.observed.occurrences = [];
		expect(() => run(f)).toThrow("incomplete_snapshot");
	});
	test("worker loss preserves output and an unconfirmed stop", () => {
		const f = fixture();
		const fact = f.facts.native[0]!;
		f.observed.status = "failed";
		f.observed.failure = { kind: "error", reason: "worker_lost" };
		f.facts.stops.push({
			version: 1,
			obligationId: "stop",
			executionId: f.binding.executionId,
			stepId: fact.handle.stepId,
			agentRunId: fact.handle.agentRunId,
			attemptId: fact.handle.attemptId,
			reason: "engine_failure",
			requestedAt: f.now.toISOString(),
			revision: 1,
			state: "ownership_unknown",
			exitReceipt: null,
		});
		const result = run(f);
		expect(result.status).toBe("failed");
		expect(result.failureKind).toBe("error");
		expect(result.error).toBe("worker_lost");
		expect(result.occurrences[0]!.output).toBe("YES\n");
		expect(result.stopObligations[0]!.confirmedAt).toBeNull();
	});
	test("feedback remains distinct from an execution error", () => {
		const f = fixture();
		f.observed.status = "failed";
		f.observed.failure = { kind: "feedback", reason: "loop_exhausted" };
		expect(run(f).failureKind).toBe("feedback");
	});
	test("an engine skip cannot hide an admitted native attempt", () => {
		const f = fixture();
		f.observed.occurrences[0]!.state = "skipped";
		f.facts.native[0]!.completion = null;
		expect(run(f).status).toBe("waiting");
	});
	test("process error output cannot approve a native gate", () => {
		const f = fixture();
		f.observed.occurrences[0]!.kind = "gate";
		f.facts.native[0]!.completion!.completion.result.exitKind = "process_error";
		expect(run(f).status).toBe("waiting");
		expect(run(f).occurrences[0]!.decision).toBeNull();
	});
	test("large output and loop round survive without truncation", () => {
		const f = fixture();
		const text = "retained\n".repeat(200_000);
		const saved = f.facts.native[0]!.completion!;
		saved.completion.result.output = text;
		saved.completion.result.outputHash = protocolDigest(text);
		f.observed.occurrences[0]!.iterationPath[0]!.round = 501;
		f.facts.native[0]!.provenance.request.iterationPath[0]!.round = 501;
		expect(run(f).occurrences[0]!.output).toBe(text);
		expect(run(f).occurrences[0]!.iterationPath[0]!.round).toBe(501);
	});
});
