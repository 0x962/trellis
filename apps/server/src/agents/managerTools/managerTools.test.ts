import { expect, test } from "bun:test";
import { managerTools } from "./managerTools";

test("manager tools expose record and assignment operations without terminal or repository operations", () => {
	const tools = managerTools(async () => ({}));
	const names = tools.list().map((tool) => tool.name);
	expect(names).toContain("trellis_tickets_get");
	expect(names).toContain("trellis_agentRuns_start");
	expect(names).toContain("trellis_agentRuns_send");
	expect(names).toContain("trellis_comments_create");
	expect(names).toContain("trellis_controller_handle");
	expect(names).not.toContain("trellis_agentRuns_terminalInput");
	expect(names).not.toContain("trellis_agentRuns_output");
	expect(names).toContain("trellis_agentRuns_session");
	expect(names).not.toContain("trellis_pullRequests_diff");
	expect(names.some((name) => name.includes("evidence"))).toBe(false);
	expect(names.some((name) => name.includes("settings"))).toBe(false);
});

test("manager session reports contain the worker result and omit native tool and launch details", async () => {
	const tools = managerTools(async () => ({
		id: "attempt",
		status: "running",
		activity: { state: "idle" },
		result: { id: "result", text: "Worker verified the fix." },
		error: null,
		agent: { sessionId: "provider", turnId: "turn", outcome: "completed", error: null, tool: { input: "source code" } },
		acknowledgedMessageIds: ["dispatch"],
		launch: { command: "secret shell command" },
		process: { pid: 123 },
	}));
	expect(await tools.call("trellis_agentRuns_session", { id: "01M277VFQA2HAWB58T9NTW4MX5" })).toEqual({
		id: "attempt",
		sessionId: "provider",
		turnId: "turn",
		acknowledgedMessageIds: ["dispatch"],
		status: "running",
		activity: { state: "idle" },
		result: { id: "result", text: "Worker verified the fix." },
		outcome: "completed",
		error: null,
	});
});

test("manager tool schemas describe real API inputs and validate before a request", async () => {
	const requests: unknown[] = [];
	const tools = managerTools(async (operation, input) => {
		requests.push({ operation, input });
		return { id: "ticket" };
	});
	const get = tools.list().find((tool) => tool.name === "trellis_tickets_get")!;
	expect(get.inputSchema).toMatchObject({ type: "object", properties: { ticket: {} } });
	await expect(tools.call("trellis_tickets_get", {})).rejects.toThrow();
	expect(requests).toEqual([]);
	expect(await tools.call("trellis_tickets_get", { ticket: "TRL-42" })).toEqual({ id: "ticket" });
	expect(requests).toEqual([{ operation: "tickets.get", input: { ticket: "TRL-42" } }]);
});

test("unknown manager operations fail before any API request", async () => {
	let called = false;
	const tools = managerTools(async () => {
		called = true;
	});
	for (const name of ["trellis_agentRuns_terminalInput", "trellis_pullRequests_diff", "Bash", "__proto__"])
		await expect(tools.call(name, { command: "git merge main" })).rejects.toThrow("Unknown manager tool");
	expect(called).toBe(false);
});
