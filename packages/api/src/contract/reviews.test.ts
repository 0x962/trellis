import { expect, test } from "bun:test";
import { reviews } from "./reviews.ts";

const input = { pr: "acme/app#1", action: "merge", headSha: "reviewed-head" };
const ticketId = "01M3RH04YEERVTTA7X5FJJYYBX";

test("a merge request without a completion choice selects no tickets", () => {
	expect(reviews.action["~orpc"].inputSchema!.parse(input).completeTicketIds).toEqual([]);
});

test("a merge request retains explicit ticket IDs and rejects invalid IDs", () => {
	const schema = reviews.action["~orpc"].inputSchema!;
	expect(schema.parse({ ...input, completeTicketIds: [ticketId] }).completeTicketIds).toEqual([ticketId]);
	expect(schema.safeParse({ ...input, completeTicketIds: ["not-a-ticket"] }).success).toBe(false);
});
