import { expect, test } from "bun:test";
import { SessionUpdateSchema, SessionUpdatesGetInputSchema, SessionUpdatesWriteInputSchema } from "./sessionUpdates.ts";

test("accepts Markdown and HTML embeds at the write boundary", () => {
	const input = SessionUpdatesWriteInputSchema.parse({
		sessionId: "Status session",
		requestId: "325611c8-b879-4eb7-9470-43eb4efc6d91",
		body: "## Current work\n\nThe database change is complete.",
		embeds: [{ title: "Plan", html: "<section>Next step</section>" }],
	});

	expect(input.embeds?.[0]).toEqual({ title: "Plan", html: "<section>Next step</section>" });
});

test("rejects blank prose, invalid requests, empty embeds, and unknown fields", () => {
	for (const input of [
		{ sessionId: "session", body: "   " },
		{ sessionId: "session", requestId: "not-a-uuid", body: "Work." },
		{ sessionId: "session", body: "Work.", embeds: [{ title: "", html: "<p>Work</p>" }] },
		{ sessionId: "session", body: "Work.", processState: "working" },
	]) {
		expect(SessionUpdatesWriteInputSchema.safeParse(input).success).toBe(false);
	}
});

test("accepts a ticket update without standalone session provenance", () => {
	expect(
		SessionUpdateSchema.parse({
			id: "01M3NVQ8K3ZBWDFDZ406A4M1D9",
			sessionId: null,
			runId: "01M3NVQ8K3ZBWDFDZ406A4M1DA",
			requestId: null,
			body: "I am checking the ticket run.",
			embeds: [],
			createdAt: "2026-09-29T05:00:00.000Z",
		}),
	).toMatchObject({ sessionId: null, runId: "01M3NVQ8K3ZBWDFDZ406A4M1DA" });
});

test("accepts a history cursor only on reads", () => {
	const input = {
		sessionId: "Status session",
		history: {
			include: true,
			before: {
				createdAt: "2026-09-29T05:00:00.000Z",
				id: "01M3NVQ8K3ZBWDFDZ406A4M1D9",
			},
		},
	};
	expect(SessionUpdatesGetInputSchema.parse(input)).toEqual(input);
	expect(SessionUpdatesWriteInputSchema.safeParse({ ...input, body: "Status" }).success).toBe(false);
	expect(
		SessionUpdatesGetInputSchema.safeParse({ ...input, history: { include: true, before: { id: "invalid" } } }).success,
	).toBe(false);
});

test("accepts the explicit first history page in RPC and REST inputs", () => {
	for (const include of [true, "true"]) {
		expect(
			SessionUpdatesGetInputSchema.parse({ sessionId: "Status session", history: { include } }).history?.include,
		).toBe(include);
	}
	for (const include of [false, "false", "", 1]) {
		expect(SessionUpdatesGetInputSchema.safeParse({ sessionId: "Status session", history: { include } }).success).toBe(
			false,
		);
	}
});
