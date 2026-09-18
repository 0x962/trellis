import { expect, test } from "bun:test";
import { flowTarget } from "./flowTarget.ts";

const ticket = {
	identifier: "OP-27",
	title: "Bound the Operator message post",
	description: "The post waits forever when the thread never answers.\n",
};

test("names the ticket, its description, and each pull request with its branches", () => {
	expect(
		flowTarget(ticket, [
			{
				url: "https://github.com/acme/web/pull/56930",
				head_ref: "trellis/op-27-01m2s1scg7ppywezh4b5m8ez4y",
				base_ref: "master",
				state: "open",
			},
		]),
	).toBe(
		[
			"Ticket OP-27: Bound the Operator message post",
			"",
			"The post waits forever when the thread never answers.",
			"",
			"Pull requests:",
			"- https://github.com/acme/web/pull/56930 (trellis/op-27-01m2s1scg7ppywezh4b5m8ez4y into master, open)",
		].join("\n"),
	);
});

test("says when no pull request is linked and skips an empty description", () => {
	expect(flowTarget({ ...ticket, description: "  " }, [])).toBe(
		"Ticket OP-27: Bound the Operator message post\n\nPull requests: none linked to the ticket.",
	);
});
