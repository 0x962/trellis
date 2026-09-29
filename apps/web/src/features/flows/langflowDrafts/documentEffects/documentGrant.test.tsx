import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { FlowDocumentSaveV1Input, FlowDocumentV1 } from "@trellis/api";
import { act } from "react";
import { receipt } from "../fixtures/fixtures";
import { mountedDraft } from "./fixture";

test("a replacement grant waits for the old receipt before it sends newer edits", async () => {
	const pending = Promise.withResolvers<FlowDocumentV1>();
	const calls: { channel: string; request: FlowDocumentSaveV1Input }[] = [];
	const f = await mountedDraft({
		save: (request) => {
			calls.push({ channel: "old", request });
			return pending.promise;
		},
	});
	try {
		await f.edit("submitted");
		await act(async () => {
			void f.value().saveNow();
		});
		const submission = f.snapshot().draft.submission;
		await f.edit("newer");
		await f.detach();
		await f.render({
			save: async (request) => {
				calls.push({ channel: "new", request });
				return receipt(request);
			},
		});
		await act(async () => {
			void f.value().saveNow();
		});
		expect(calls).toHaveLength(1);
		expect(f.snapshot().draft.submission).toEqual(submission);
		await act(async () => pending.resolve(receipt(calls[0]!.request)));
		await f.flush();
		expect(calls.map((call) => call.channel)).toEqual(["old", "new"]);
		expect(calls[1]!.request.graphDocument).toEqual({ text: "newer" });
		expect(calls[1]!.request.expectedVersion).toBe(calls[0]!.request.expectedVersion + 1);
		expect(calls[1]!.request.requestId).not.toBe(calls[0]!.request.requestId);
		expect(f.snapshot().saved).toBe(true);
	} finally {
		await f.close();
	}
});

test("a new grant replays lost response bytes before newer edits with an explicit retry", async () => {
	const calls: { channel: string; bytes: string }[] = [];
	const f = await mountedDraft({
		save: async (request) => {
			calls.push({ channel: "old", bytes: JSON.stringify(request) });
			throw new Error("Response lost after commit.");
		},
	});
	try {
		await f.edit("submitted");
		await f.flush();
		await f.edit("newer");
		const exported = f.value().exportDraft();
		await f.detach();
		const accepted = receipt(JSON.parse(calls[0]!.bytes));
		await f.render({
			document: accepted,
			save: async (request) => {
				calls.push({ channel: "new", bytes: JSON.stringify(request) });
				return receipt(request);
			},
		});
		expect(f.value().exportDraft()).toBe(exported);
		await f.flush();
		expect(calls).toHaveLength(1);
		await f.retry();
		expect(calls.map((call) => call.channel)).toEqual(["old", "new", "new"]);
		expect(calls[1]!.bytes).toBe(calls[0]!.bytes);
		const next = JSON.parse(calls[2]!.bytes) as FlowDocumentSaveV1Input;
		expect(next.expectedVersion).toBe(accepted.revision);
		expect(next.graphDocument).toEqual({ text: "newer" });
		expect(f.snapshot().saved).toBe(true);
	} finally {
		await f.close();
	}
});

test("a fresh document and grant cannot clear a retained compare-and-set conflict", async () => {
	let calls = 0;
	let submitted!: FlowDocumentSaveV1Input;
	const f = await mountedDraft({
		save: async (request) => {
			calls++;
			submitted = request;
			throw new ORPCError("FLOW_VERSION_CONFLICT");
		},
	});
	try {
		await f.edit("keep conflicted bytes");
		await f.flush();
		const exported = f.value().exportDraft();
		await f.detach();
		await f.render({
			document: receipt(submitted),
			save: async (request) => {
				calls++;
				return receipt(request);
			},
		});
		await f.retry();
		await f.flush();
		expect(calls).toBe(1);
		expect(f.value().exportDraft()).toBe(exported);
		expect(f.snapshot()).toMatchObject({
			failure: "conflict",
			saved: false,
			draft: { baseVersion: submitted.expectedVersion },
		});
	} finally {
		await f.close();
	}
});
