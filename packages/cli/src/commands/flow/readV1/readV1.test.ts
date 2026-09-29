import { expect, test } from "bun:test";
import {
	executionViewV1Example,
	flowReviewCredit,
	legacyDocumentV1Example,
	occurrenceV1Example,
	pendingDocumentV1Example,
	publishedDocumentV1Example,
	stopPendingV1Example,
	unknownAdmissionV1Example,
	unknownDecisionV1Example,
} from "@trellis/api";
import type { TrellisClient } from "@trellis/api/client";
import { json } from "../../../output.ts";
import { flowRunText } from "../../flows/flowText.ts";
import { flowReadiness } from "../../ready/flowReadiness.ts";
import { runProgress } from "../runProgress/runProgress.ts";
import { fixture, legacyRun } from "../testFixture/testFixture.ts";
import { waitForRun } from "../waitForRun/waitForRun.ts";
import { readV1 } from "./readV1.ts";

test("document readers preserve both formats, saved revisions, and older publications", () => {
	for (const document of [legacyDocumentV1Example, pendingDocumentV1Example, publishedDocumentV1Example]) {
		expect(JSON.parse(json(readV1.document(document)))).toEqual(document);
	}
	expect(readV1.document(pendingDocumentV1Example).lastExecutablePublication!.revision).toBe(1);
	expect(readV1.document(pendingDocumentV1Example).revision).toBe(2);
});

test("unknown versions and engines never select a legacy reader", () => {
	for (const value of [{ schemaVersion: 2 }, { engine: "future-engine" }]) {
		expect(() => readV1.document({ ...publishedDocumentV1Example, ...value })).toThrow();
		expect(() => readV1.execution({ ...executionViewV1Example, ...value })).toThrow();
	}
});

test("execution JSON preserves exact attempts, unknown ownership, decisions, and stops", () => {
	for (const view of [
		executionViewV1Example,
		unknownAdmissionV1Example,
		stopPendingV1Example,
		{ ...executionViewV1Example, occurrences: [occurrenceV1Example], decisionDeliveries: [unknownDecisionV1Example] },
	]) {
		expect(JSON.parse(json(readV1.execution(view)))).toEqual(view);
	}
});

test("a legacy V1 snapshot keeps stable flow and execution IDs", () => {
	const { publication: _publication, lastExecutablePublication: _last, ...snapshot } = legacyDocumentV1Example;
	const view = readV1.execution({
		...executionViewV1Example,
		engine: "legacy",
		snapshot,
		publication: null,
		submission: null,
	});
	expect(view.id).toBe(legacyRun.id);
	expect(view.flowId).toBe(legacyRun.flowId);
	expect(runProgress(view).name).toBe(legacyRun.doc.flow.name);
});

test("V1 human waits stop local polls without success text", async () => {
	const waiting = readV1.execution({
		...executionViewV1Example,
		status: "waiting",
		detail: "waiting_human",
		occurrences: [{ ...occurrenceV1Example, title: "Approve", state: "waiting_human", waitReason: "human" }],
	});
	const f = fixture(() => {
		throw new Error("Unexpected request");
	});
	const result = await waitForRun(
		waiting,
		async () => {
			throw new Error("Unexpected poll");
		},
		f.deps,
		60_000,
	);
	expect(result.status).toBe("waiting");
	expect(f.sleeps).toEqual([]);
	expect(flowRunText(result, 1)).toContain("waits for a person on #1 at the step Approve");
	expect(flowRunText(result, 1)).not.toContain("succeeded");
});

test("native and unknown waits keep polling the same ID until completion", async () => {
	for (const detail of ["waiting_native", "unknown"] as const) {
		const waiting = readV1.execution({ ...executionViewV1Example, status: "waiting", detail });
		const done = readV1.execution({ ...waiting, status: "succeeded", detail: "completed" });
		const f = fixture(() => ({}));
		const ids: string[] = [];
		const result = await waitForRun(
			waiting,
			async (id) => {
				ids.push(id);
				return done;
			},
			f.deps,
			60_000,
		);
		expect(ids).toEqual([waiting.id]);
		expect(f.sleeps).toEqual([5000]);
		expect(result).toEqual(done);
		expect(flowRunText(waiting, 1)).toContain(`(${detail})`);
		expect(flowRunText(waiting, 1)).not.toContain("person");
	}
});

test("V1 failure text uses the immutable occurrence title and retains its error kind", () => {
	for (const failureKind of ["error", "feedback"] as const) {
		const failed = readV1.execution({
			...executionViewV1Example,
			status: "failed",
			detail: "failed",
			failureKind,
			occurrences: [{ ...occurrenceV1Example, title: "Read the diff", state: "failed", error: "Stopped." }],
		});
		expect(runProgress(failed).failureKind).toBe(failureKind);
		expect(flowRunText(failed, 1)).toBe("The Review flow failed on #1 at the step Read the diff. Stopped.\n");
	}
});

test("readiness finds success after 1000 runs and gives human waits no credit", async () => {
	const records = Array.from({ length: 1001 }, () => ({
		...legacyRun,
		state: { ...legacyRun.state, status: "waiting" },
	}));
	const offsets: number[] = [];
	const client = {
		flows: { list: async () => [{ ...legacyRun.doc.flow, nodeCount: 0 }] },
		flowExecutions: {
			list: async ({ offset }: { offset: number }) => {
				offsets.push(offset);
				return records.slice(offset, offset + 500);
			},
		},
		pullRequests: { readFlowWaiver: async () => null },
	} as unknown as TrellisClient;
	const ref = { id: legacyRun.diffId!, url: "https://github.com/example/app/pull/1" };
	expect((await flowReadiness(client, ref, "TRL-1")).satisfied).toBe(false);
	expect(offsets).toEqual([0, 500, 1000]);
	records[1000]!.state.status = "succeeded";
	expect((await flowReadiness(client, ref, "TRL-1")).satisfied).toBe(true);
});

test("the shared credit function treats V1 and legacy results equally", () => {
	const input = {
		diffId: legacyRun.diffId!,
		hasTicket: true,
		waived: false,
		applicableFlowIds: [legacyRun.flowId],
	};
	for (const status of ["waiting", "failed", "canceled", "running", "succeeded"] as const) {
		const view = { ...executionViewV1Example, diffId: legacyRun.diffId, status };
		const legacy = { flowId: legacyRun.flowId, diffId: legacyRun.diffId, status };
		expect(flowReviewCredit({ ...input, runs: [view] })).toBe(status === "succeeded");
		expect(flowReviewCredit({ ...input, runs: [legacy] })).toBe(status === "succeeded");
	}
});
