import { expect, test } from "bun:test";
import { runCli } from "../../../deps.ts";
import { project, projectId } from "../../../fixtures.ts";

test("manager list resolves project and preserves the unfinished-work cursor", async () => {
	const result = await runCli(["manager", "list", "--project", "CDE", "--unhandled", "--before", "dispatch"], {
		"projects.get": project(),
		"controller.list": [],
	});
	expect(result.code).toBe(0);
	expect(result.calls[1]).toMatchObject({
		path: "controller.list",
		input: { projectId, unhandled: true, before: "dispatch" },
	});
});

test("manager handle sends ticket outcomes without changing their dispatch generation", async () => {
	const outcomes = [{ ticketId: "ticket", status: "queued", reason: "The project is at capacity." }];
	const result = await runCli(
		["manager", "handle", "dispatch", "--generation", "12", "--outcomes", JSON.stringify(outcomes)],
		{ "controller.handle": { id: "dispatch" } },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({
		path: "controller.handle",
		input: { id: "dispatch", generation: 12, outcomes },
	});
});

test("manager handle reports invalid JSON before an API call", async () => {
	const result = await runCli(["manager", "handle", "dispatch", "--generation", "1", "--outcomes", "{"], {});
	expect(result.code).toBe(2);
	expect(result.calls).toEqual([]);
});
