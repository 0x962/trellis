import { expect, test } from "bun:test";
import { managerTools } from "./managerTools";

test("the manager handle tool preserves each explicit wake condition", async () => {
	const inputs: unknown[] = [];
	const tools = managerTools(async (_operation, input) => {
		inputs.push(input);
		return {};
	});
	for (const waitFor of [
		{ type: "time", at: "2030-01-01T00:00:00Z" },
		{ type: "dependency", ticketId: "dependency" },
		{ type: "human_response", commentId: "question" },
	]) {
		const input = {
			id: "dispatch",
			generation: 1,
			outcomes: [{ ticketId: "ticket", status: "blocked", reason: "Wait.", waitFor }],
		};
		await tools.call("trellis_controller_handle", input);
		expect(inputs.at(-1)).toEqual(input);
	}
});

test.each([
	["list", { project: "TRL" }],
	["start", { personaId: "01M277VFQA2HAWB58T9NTW4MX5", ticket: "TRL-42" }],
	["send", { id: "01M277VFQA2HAWB58T9NTW4MX5", text: "Continue the assignment." }],
	["stop", { id: "01M277VFQA2HAWB58T9NTW4MX5" }],
	["refresh", { id: "01M277VFQA2HAWB58T9NTW4MX5" }],
] as const)("manager agentRuns.%s omits stored instructions and retains assignment records", async (action, input) => {
	const record = {
		id: "01M277VFQA2HAWB58T9NTW4MX5",
		name: "Builder",
		personaId: "persona",
		personaName: "Builder",
		kind: "builder",
		working: false,
		replacementAllowed: true,
		processStatus: "exited",
		projectId: "project",
		projectPath: "/project",
		ticketId: "ticket",
		ticketIdentifier: "TRL-42",
		workspaceId: "workspace",
		terminalId: "attempt",
		sessionId: "session",
		error: "Worker exit status 1",
	};
	const original = { ...record, state: "exited", instruction: "Historical manager persona and personal UI policy" };
	const tools = managerTools(async () => (action === "list" ? [original] : original));
	const result = await tools.call(`trellis_agentRuns_${action}`, input);
	expect(result).toEqual(action === "list" ? { items: [record], total: 1, nextOffset: null } : record);
	expect(JSON.stringify(result)).not.toContain("Historical manager persona");
	expect(original.instruction).toBe("Historical manager persona and personal UI policy");
});

test("manager personas list omits instructions and personas get returns one full persona", async () => {
	const persona = {
		id: "01M277VFQA2HAWB58T9NTW4MX5",
		name: "Trellis",
		kind: "manager",
		instruction: "A".repeat(90_000),
		createdAt: "2026-09-11T03:23:20.679Z",
		updatedAt: "2026-09-16T14:11:23.810Z",
	};
	const tools = managerTools(async (operation) => (operation === "personas.list" ? [persona] : persona));
	const { instruction, ...summary } = persona;
	expect(await tools.call("trellis_personas_list", {})).toEqual([summary]);
	expect(await tools.call("trellis_personas_get", { id: persona.id })).toEqual(persona);
	expect(instruction).toHaveLength(90_000);
});

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

test("manager session reports omit diagnostic details by default", async () => {
	const tools = managerTools(async () => ({
		id: "attempt",
		status: "running",
		checkedAt: "2026-09-15T22:00:00.000Z",
		controllable: true,
		activity: { state: "idle" },
		result: { id: "result", text: "Worker verified the fix." },
		error: null,
		agent: { sessionId: "provider", turnId: "turn", outcome: "completed", error: null, tool: { input: "source code" } },
		acknowledgedMessageIds: ["dispatch"],
		launch: { command: "secret shell command" },
		process: { pid: 123 },
	}));
	expect(await tools.call("trellis_agentRuns_session", { id: "01M277VFQA2HAWB58T9NTW4MX5" })).toEqual({
		status: "running",
		checkedAt: "2026-09-15T22:00:00.000Z",
		controllable: true,
		working: false,
		replacementAllowed: false,
		activity: { state: "idle" },
		outcome: "completed",
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

test.each([
	["running", "working", null, true, true, false],
	["running", "ready", null, true, false, false],
	["running", "idle", "completed", true, false, false],
	["running", "working", "failed", true, false, false],
	["running", "working", null, false, false, false],
	["exited", "working", null, false, false, true],
	["unknown", "working", null, false, false, false],
	[null, null, null, false, false, false],
] as const)(
	"manager list distinguishes process %s and activity %s from active work",
	async (processStatus, activity, outcome, controllable, working, replacementAllowed) => {
		const record = {
			id: "01M277VFQA2HAWB58T9NTW4MX5",
			state: "running",
			processStatus,
			instruction: "Saved assignment",
			observation:
				processStatus === null
					? null
					: {
							checkedAt: "2026-09-15T22:00:00.000Z",
							controllable,
							activity: activity === null ? null : { state: activity, updatedAt: "2026-09-15T21:00:00.000Z" },
							outcome,
							turnId: "turn",
						},
		};
		const tools = managerTools(async () => [record]);
		const result = await tools.call("trellis_agentRuns_list", { project: "TRL" });
		expect(result).toMatchObject({
			items: [{ processStatus, working, replacementAllowed, observation: record.observation }],
		});
		expect(result).not.toMatchObject({ items: [{ state: "running" }] });
	},
);

test("a missing manager session explicitly reports unknown work and unconfirmed cleanup", async () => {
	const tools = managerTools(async (operation) => (operation === "agentRuns.session" ? null : []));
	expect(await tools.call("trellis_agentRuns_session", { id: "01M277VFQA2HAWB58T9NTW4MX5" })).toEqual({
		status: "unknown",
		checkedAt: null,
		controllable: false,
		working: false,
		replacementAllowed: false,
		activity: null,
	});
});

test("a native assignment with no launched attempt permits a corrected start", async () => {
	const tools = managerTools(async () => [
		{
			runtime: "native",
			terminalId: null,
			processStatus: null,
			observation: null,
			state: "interrupted",
			instruction: "Task",
			error: "Executable not found",
		},
	]);
	expect(await tools.call("trellis_agentRuns_list", {})).toMatchObject({
		items: [{ working: false, replacementAllowed: true }],
	});
});

test("session and list agree when an assignment never launched a process", async () => {
	const record = {
		id: "01M277VFQA2HAWB58T9NTW4MX5",
		runtime: "native",
		terminalId: null,
		processStatus: null,
		observation: null,
		state: "interrupted",
		instruction: "Task",
		error: "Executable not found",
	};
	const tools = managerTools(async (operation) => (operation === "agentRuns.session" ? null : [record]));
	expect(await tools.call("trellis_agentRuns_session", { id: record.id, include: ["error"] })).toMatchObject({
		working: false,
		replacementAllowed: true,
		error: "Executable not found",
	});
});

test("managers can inspect accounts and select one without account administration", async () => {
	const calls: { operation: string; input: unknown }[] = [];
	const tools = managerTools(async (operation, input) => {
		calls.push({ operation, input });
		return {};
	});
	const names = tools.list().map((tool) => tool.name);
	expect(names).toContain("trellis_harnessAccounts_list");
	expect(names).toContain("trellis_harnessAccounts_quota");
	expect(names).not.toContain("trellis_harnessAccounts_create");
	expect(names).not.toContain("trellis_harnessAccounts_update");
	expect(names).not.toContain("trellis_harnessAccounts_remove");
	const accountId = "01M277VFQA2HAWB58T9NTW4MX5";
	await tools.call("trellis_agentRuns_start", { personaId: accountId, ticket: "TRL-42", accountId });
	await tools.call("trellis_agentRuns_resume", {
		id: accountId,
		accountId,
		expectedTerminalId: "old-attempt",
		requestId: "switch",
	});
	expect(calls.map((call) => call.input)).toEqual([
		{ personaId: accountId, ticket: "TRL-42", accountId },
		{ id: accountId, accountId, expectedTerminalId: "old-attempt", requestId: "switch" },
	]);
});

test.each(["start", "resume"])("manager %s accepts and forwards a model override", async (action) => {
	const calls: unknown[] = [];
	const tools = managerTools(async (_operation, input) => {
		calls.push(input);
		return {};
	});
	const id = "01M277VFQA2HAWB58T9NTW4MX5";
	const input =
		action === "start"
			? { personaId: id, ticket: "TRL-42", model: " anthropic/claude-sonnet-5 " }
			: { id, expectedTerminalId: "attempt", requestId: "resume-model", model: " anthropic/claude-opus-5 " };
	await tools.call(`trellis_agentRuns_${action}`, input);
	expect(calls[0]).toEqual({ ...input, model: input.model.trim() });
	await expect(tools.call(`trellis_agentRuns_${action}`, { ...input, model: "  " })).rejects.toThrow();
});

test("manager can change and inspect an active agent model", async () => {
	const calls: unknown[] = [];
	const tools = managerTools(async (operation, input) => {
		calls.push({ operation, input });
		return operation === "agentRuns.session" ? { agent: { model: "anthropic/claude-opus-5" } } : {};
	});
	const id = "01M277VFQA2HAWB58T9NTW4MX5";
	const input = { id, model: "anthropic/claude-opus-5", expectedTerminalId: "attempt", requestId: "model-change" };
	await tools.call("trellis_agentRuns_setModel", input);
	expect(calls[0]).toEqual({ operation: "agentRuns.setModel", input });
	expect(await tools.call("trellis_agentRuns_session", { id, include: ["model"] })).toMatchObject({
		model: "anthropic/claude-opus-5",
	});
});

test("manager discovers canonical model choices by harness", async () => {
	const calls: unknown[] = [];
	const tools = managerTools(async (operation, input) => {
		calls.push({ operation, input });
		return [{ id: "meta/muse-spark-1.3", name: "Muse Spark 1.3" }];
	});
	expect(await tools.call("trellis_models_list", { harness: "pi" })).toEqual([
		{ id: "meta/muse-spark-1.3", name: "Muse Spark 1.3" },
	]);
	expect(calls).toEqual([{ operation: "models.list", input: { harness: "pi" } }]);
});
