import { expect, test } from "bun:test";
import type { RuntimeHarnessObservation } from "@trellis/runtime-protocol";
import { type ReadEvents, readSubagentPage } from "./readSubagentPage.ts";

const line = (id: string, kind: "tool-start" | "tool-end" = "tool-start") =>
	`${JSON.stringify({
		observedAt: "2026-10-10T10:00:00.000Z",
		event: {
			kind,
			tool: { id, name: "Agent", input: { prompt: "Review." }, ...(kind === "tool-end" ? { output: "Done." } : {}) },
		},
	} satisfies RuntimeHarnessObservation)}\n`;
const read =
	(files: Record<string, string>, size = 65536): ReadEvents =>
	async (id, offset) => {
		if (!Object.hasOwn(files, id)) throw Object.assign(new Error("Missing"), { code: "SESSION_NOT_FOUND" });
		const bytes = Buffer.from(files[id]!);
		const chunk = bytes.subarray(offset, offset + size);
		return {
			data: chunk.toString("base64"),
			startOffset: Math.min(offset, bytes.length),
			nextOffset: Math.min(offset + size, bytes.length),
			truncated: false,
		};
	};

test("a cursor stops at complete records across byte boundaries", async () => {
	const first = line("spawn");
	const reader = read({ attempt: first + line("spawn", "tool-end") }, first.length + 20);
	const page = await readSubagentPage("parent", "claude", [{ id: "attempt" }], undefined, reader, 1);
	expect(page.observations).toMatchObject([{ toolCallId: "spawn", state: "started" }]);
	expect(page.hasMore).toBe(true);
	const next = await readSubagentPage("parent", "claude", [{ id: "attempt" }], page.nextCursor!, reader, 2);
	expect(next.observations).toMatchObject([{ toolCallId: "spawn", state: "result-recorded", output: "Done." }]);
	expect(next.hasMore).toBe(false);
	expect(next.issues).toEqual([]);
});

test("pages retain older attempts and continue past missing files", async () => {
	const attempts = [{ id: "old" }, { id: "missing" }, { id: "new" }];
	const reader = read({ old: line("same"), new: line("same", "tool-end") });
	const page = await readSubagentPage("parent", "claude", attempts, undefined, reader, 2);
	expect(page.observations[0]).toMatchObject({ attemptId: "old", toolCallId: "same" });
	const next = await readSubagentPage("parent", "claude", attempts, page.nextCursor!, reader);
	expect(next.observations[0]).toMatchObject({ attemptId: "new", toolCallId: "same" });
	expect(next.issues).toEqual([{ attemptId: "missing", reason: "unavailable" }]);
	expect(next.hasMore).toBe(false);
});

test("invalid and oversized records are explicit and do not hide later records", async () => {
	const attempts = [{ id: "attempt" }];
	const reader = read({ attempt: `${"x".repeat(200)}\nnot json\n${line("valid")}` }, 180);
	const page = await readSubagentPage("parent", "claude", attempts, undefined, reader, 1);
	expect(page.issues).toEqual([{ attemptId: "attempt", reason: "oversized-record" }]);
	const next = await readSubagentPage("parent", "claude", attempts, page.nextCursor!, reader);
	expect(next.issues).toEqual([{ attemptId: "attempt", reason: "invalid-record" }]);
	expect(next.observations).toMatchObject([{ toolCallId: "valid" }]);
	expect(next.hasMore).toBe(false);
});

test("cursor scope and recorded offsets must match the requested run", async () => {
	const attempts = [{ id: "attempt" }];
	const reader = read({ attempt: line("valid") });
	const first = await readSubagentPage("parent", "claude", attempts, undefined, reader);
	await expect(readSubagentPage("other", "claude", attempts, first.nextCursor!, reader)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
	await expect(
		readSubagentPage("parent", "claude", [{ id: "foreign" }], first.nextCursor!, reader),
	).rejects.toMatchObject({ code: "INPUT_VALIDATION_FAILED" });
	await expect(readSubagentPage("parent", "claude", attempts, "bad", reader)).rejects.toMatchObject({
		code: "INPUT_VALIDATION_FAILED",
	});
});

test("the 200-observation cap resumes at the next record", async () => {
	const reader = read({ attempt: Array.from({ length: 401 }, (_, index) => line(String(index))).join("") });
	const attempts = [{ id: "attempt" }];
	const first = await readSubagentPage("parent", "claude", attempts, undefined, reader);
	const second = await readSubagentPage("parent", "claude", attempts, first.nextCursor!, reader);
	const third = await readSubagentPage("parent", "claude", attempts, second.nextCursor!, reader);
	expect([first.observations.length, second.observations.length, third.observations.length]).toEqual([200, 200, 1]);
	expect(
		[...first.observations, ...second.observations, ...third.observations].map(
			(entry) => entry.kind === "spawn" && entry.toolCallId,
		),
	).toEqual(Array.from({ length: 401 }, (_, index) => String(index)));
	expect(third.hasMore).toBe(false);
});

test("the cap resumes inside one provider event without losing child statuses", async () => {
	const statuses = Object.fromEntries(
		Array.from({ length: 203 }, (_, index) => [String(index), { status: "running" }]),
	);
	const content = `${JSON.stringify({
		observedAt: "2026-10-10T10:00:00.000Z",
		event: {
			kind: "tool-end",
			tool: {
				id: "wait",
				name: "Agent",
				output: {
					type: "collabAgentToolCall",
					tool: "wait",
					status: "completed",
					prompt: null,
					receiverThreadIds: Object.keys(statuses),
					agentsStates: statuses,
				},
			},
		},
	})}\n`;
	const reader = read({ attempt: content });
	const attempts = [{ id: "attempt" }];
	const first = await readSubagentPage("parent", "codex", attempts, undefined, reader);
	const second = await readSubagentPage("parent", "codex", attempts, first.nextCursor!, reader);
	expect([first.observations.length, second.observations.length]).toEqual([200, 3]);
	expect(second.observations[0]).toMatchObject({ providerChildId: "200" });
	expect(second.hasMore).toBe(false);
	const retained = Buffer.from(content);
	const boundary = retained.length + 100;
	const truncatedReader: ReadEvents = async (_id, offset) => ({
		data: offset < boundary ? retained.toString("base64") : "",
		startOffset: Math.max(offset, boundary),
		nextOffset: boundary + retained.length,
		truncated: offset < boundary,
	});
	const changed = await readSubagentPage("parent", "codex", attempts, first.nextCursor!, truncatedReader);
	expect(changed.observations).toHaveLength(200);
	expect(changed.observations[0]).toMatchObject({ providerChildId: "0" });
	expect(changed.issues).toEqual([{ attemptId: "attempt", reason: "truncated" }]);
});
