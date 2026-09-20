import { expect, test } from "bun:test";
import type { TrellisClient } from "@trellis/api/client";
import { evidenceFloorMissing } from "../../errors.ts";
import { handOverGuard } from "./handOverGuard.ts";

const risk = {
	auth: "no" as const,
	migration: "no" as const,
	dependency: "no" as const,
	sharedType: "no" as const,
	deletedTest: "no" as const,
};

const linked = { id: "01M30HDWKZ17G62PJAFHZNED2J", url: "https://github.com/acme/roadmap/pull/42" };

const clientWith = (rows: Array<{ kind: string; headSha: string }>, summary: object | null): TrellisClient =>
	({
		tickets: {
			get: async () => ({
				identifier: "KEY-42",
				title: "Add the hand-over guard",
				contract: { verify: ["bun test"] },
				prs: [linked],
			}),
		},
		pullRequests: {
			refresh: async () => ({ number: 42, url: linked.url }),
			listEvidence: async () => rows,
			readSummaryHead: async () => summary,
		},
		reviews: {
			status: async () => ({
				headRefOid: "head-sha",
				prRow: {
					kind: "backend",
					risk,
					pass: 1,
					fail: 0,
					pending: 0,
					skipped: 0,
					failedChecks: [],
				},
			}),
		},
	}) as unknown as TrellisClient;

test("does not read the ticket for another target", async () => {
	const client = {} as TrellisClient;

	expect(await handOverGuard(client, "agent", "KEY-42", "done")).toBeNull();
});

test("allows an agent hand-over with no linked pull request", async () => {
	const client = {
		tickets: { get: async () => ({ prs: [] }) },
	} as unknown as TrellisClient;

	expect(await handOverGuard(client, "agent", "KEY-42", "human-review")).toBeNull();
});

test("refuses an agent with the evidence check list for an incomplete floor", async () => {
	const result = await handOverGuard(clientWith([], null), "agent", "KEY-42", "human-review");

	expect(result?.refuses).toBe(true);
	expect(result?.text).toContain(`#42  KEY-42  Add the hand-over guard
kind: backend            0 of 4 required present`);
	expect(result?.text).toContain("  MISSING  summary");
	expect(result?.text).toContain("  MISSING  verify record");
	expect(result?.text).toContain("  MISSING  test proof");
	expect(result?.text).toContain("  MISSING  contract table");
});

test("shows the evidence check list to a human without a refusal", async () => {
	const result = await handOverGuard(clientWith([], null), "human", "KEY-42", "human-review");

	expect(result?.refuses).toBe(false);
	expect(result?.text).toContain("  MISSING  summary");
});

test("allows an agent hand-over with a complete floor", async () => {
	const rows = ["verify", "test", "contract"].map((kind) => ({ kind, headSha: "head-sha" }));

	expect(await handOverGuard(clientWith(rows, {}), "agent", "KEY-42", "human-review")).toBeNull();
});

test("declares the hand-over refusal code and text", () => {
	const failure = evidenceFloorMissing("KEY-42");

	expect(failure.code).toBe("EVIDENCE_FLOOR_MISSING");
	expect(failure.exitCode).toBe(1);
	expect(failure.message).toBe("An agent cannot move KEY-42 to human-review while required evidence is missing.");
});
