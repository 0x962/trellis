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

test("manager actions supports project, state, and pagination", async () => {
	const result = await runCli(["manager", "actions", "--project", "CDE", "--state", "waiting", "--before", "action"], {
		"projects.get": project(),
		"controller.actions": [],
	});
	expect(result.code).toBe(0);
	expect(result.calls[1]).toMatchObject({
		path: "controller.actions",
		input: { projectId, state: "waiting", before: "action" },
	});
});

test("manager cancel-action sends the saved action identifier", async () => {
	const result = await runCli(["manager", "cancel-action", "action"], {
		"controller.cancelAction": { id: "action", state: "canceled" },
	});
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({ path: "controller.cancelAction", input: { id: "action" } });
});
