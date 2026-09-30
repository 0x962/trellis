import { expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import type { TrellisClient } from "@trellis/api/client";
import { requestReview } from "./requestReview.ts";

const ref = { id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/trellis/pull/131" };

test("a refused local write remains an error", async () => {
	const client = {
		pullRequests: {
			setLocalState: async () => {
				throw new ORPCError("PROJECT_ARCHIVED");
			},
		},
	} as unknown as TrellisClient;
	await expect(requestReview(client, ref)).rejects.toMatchObject({ code: "PROJECT_ARCHIVED" });
});

test("an explicit flow reason saves the reason and then records the local request", async () => {
	const calls: unknown[] = [];
	const pullRequest = { id: ref.id, localState: "ready", isDraft: true };
	const client = {
		pullRequests: {
			refresh: async () => ({ number: 131 }),
			writeFlowWaiver: async (input: unknown) => calls.push(input),
			setLocalState: async (input: unknown) => {
				calls.push(input);
				return pullRequest;
			},
		},
		reviews: { status: async () => ({ headRefOid: "abc123", ticket: null }) },
	} as unknown as TrellisClient;

	expect(await requestReview(client, ref, " No flow fits this change. ")).toMatchObject(pullRequest);
	expect(calls).toEqual([
		{ id: ref.id, headSha: "abc123", reason: "No flow fits this change." },
		{ id: ref.id, localState: "ready" },
	]);
});

test("an empty flow reason fails before any request", async () => {
	await expect(requestReview({} as TrellisClient, ref, " ")).rejects.toMatchObject({ code: "USAGE" });
});
