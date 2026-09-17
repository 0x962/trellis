import { describe, expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { statusSummary, ticket } from "../../../fixtures.ts";

describe("move", () => {
	// CLI-93
	test("move maps status, anchors, and force", async () => {
		const result = await runCli(
			["move", "CDE-42", "in-progress", "--after", "CDE-40", "--before", "CDE-41", "--force"],
			{ "tickets.move": ticket() },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "tickets.move" });
		expect(result.calls[0]!.input).toEqual({
			ticket: "CDE-42",
			status: "in-progress",
			after: "CDE-40",
			before: "CDE-41",
			force: true,
		});

		const named = await runCli(["move", "CDE-42", "Human Review"], { "tickets.move": ticket() });
		expect(named.calls[0]!.input).toEqual({ ticket: "CDE-42", status: "Human Review" });
	});

	// CLI-94
	test("move done as an agent succeeds without force", async () => {
		const result = await runCli(["move", "CDE-1", "done", "--as", "agent:manager"], {
			"tickets.move": ticket({ status: statusSummary({ slug: "done", category: "done" }) }),
		});
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-1", status: "done" });
	});
});
