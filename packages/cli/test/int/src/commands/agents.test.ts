import { describe, expect, test } from "bun:test";
import { lines, runCli } from "../../../deps.ts";
import { agentRun, agentRunId, persona, personaId, personaId2 } from "../../../fixtures.ts";

describe("agents list", () => {
	// CLI-124
	test("agents list passes the ticket and the project filters", async () => {
		const result = await runCli(
			["agents", "list", "--ticket", "CDE-42"],
			{ "agentRuns.list": [agentRun()] },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "agentRuns.list", input: { ticket: "CDE-42" } });
		const [header, ...rows] = lines(result.stdout);
		const names = header!
			.trim()
			.split(/\s{2,}/)
			.map((name) => name.toLowerCase());
		for (const name of ["id", "kind", "persona", "state", "ticket"]) expect(names, name).toContain(name);
		expect(rows[0]).toContain("Feature Builder");
		expect(rows[0]).not.toContain("Iris Brooks");
		expect(rows[0]).toContain("running");

		const project = await runCli(["agents", "list", "--project", "CDE"], { "agentRuns.list": [] });
		expect(project.calls[0]!.input).toEqual({ project: "CDE" });

		const all = await runCli(["agents", "list"], { "agentRuns.list": [] });
		expect(all.calls[0]!.input).toEqual({});
	});
});

describe("agents start", () => {
	test("agents start sends a stable assignment request ID", async () => {
		const result = await runCli(
			["agents", "start", personaId, "--ticket", "CDE-42", "--request-id", "CDE-42:builder"],
			{
				"personas.get": persona(),
				"agentRuns.start": agentRun(),
			},
		);
		expect(result.code).toBe(0);
		expect(result.calls[1]!.input).toEqual({ personaId, ticket: "CDE-42", requestId: "CDE-42:builder" });
	});
	test("agents start resolves the persona by id and by name", async () => {
		const byId = await runCli(["agents", "start", personaId, "--ticket", "CDE-42"], {
			"personas.get": persona(),
			"agentRuns.start": agentRun(),
		});
		expect(byId.code).toBe(0);
		expect(byId.calls.map((call) => call.path)).toEqual(["personas.get", "agentRuns.start"]);
		expect(byId.calls[1]!.input).toEqual({ personaId, ticket: "CDE-42" });

		const byName = await runCli(["agents", "start", "Trellis Manager", "--project", "CDE"], {
			"personas.list": [persona(), persona({ id: personaId2, name: "Trellis Manager", kind: "manager" })],
			"agentRuns.start": agentRun({ kind: "manager", ticketId: null, ticketIdentifier: null }),
		});
		expect(byName.code).toBe(0);
		expect(byName.calls.map((call) => call.path)).toEqual(["personas.list", "agentRuns.start"]);
		expect(byName.calls[1]!.input).toEqual({ personaId: personaId2, project: "CDE" });

		const missing = await runCli(["agents", "start", "Nobody", "--ticket", "CDE-42"], { "personas.list": [persona()] });
		expect(missing.code).toBe(3);
		expect(missing.calls.map((call) => call.path)).toEqual(["personas.list"]);
	});

	// CLI-126: the row is stored before the terminal comes up, so a failed
	// start answers a row. The verb prints it and signals the failure.
	test("agents start exits 6 when the terminal does not come up", async () => {
		const row = agentRun({ state: "failed", error: "no Superset project matches the repositories", url: null });
		const result = await runCli(
			["agents", "start", personaId, "--ticket", "CDE-42"],
			{ "personas.get": persona(), "agentRuns.start": row },
			{ tty: true },
		);
		expect(result.code).toBe(6);
		expect(result.stdout).toContain("failed");
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("no Superset project matches the repositories");
	});
});

describe("agents refresh, stop, send, and output", () => {
	test("agents interrupt targets the current turn and preserves the assignment", async () => {
		const result = await runCli(["agents", "interrupt", agentRunId, "--json"], { "agentRuns.interrupt": {} });
		expect(result.code).toBe(0);
		expect(result.calls).toHaveLength(1);
		expect(result.calls[0]).toMatchObject({ path: "agentRuns.interrupt", input: { id: agentRunId } });
		expect(JSON.parse(result.stdout)).toEqual({});
	});
	// CLI-127
	test("the id verbs map their args and print the row", async () => {
		const refresh = await runCli(["agents", "refresh", agentRunId], { "agentRuns.refresh": agentRun() });
		expect(refresh.code).toBe(0);
		expect(refresh.calls[0]).toMatchObject({ path: "agentRuns.refresh", input: { id: agentRunId } });

		const stop = await runCli(["agents", "stop", agentRunId], { "agentRuns.stop": agentRun({ state: "stopped" }) });
		expect(stop.code).toBe(0);
		expect(stop.calls[0]).toMatchObject({ path: "agentRuns.stop", input: { id: agentRunId } });
		expect(JSON.parse(stop.stdout)).toMatchObject({ state: "stopped" });

		const send = await runCli(["agents", "send", agentRunId, "--text", "CI is red"], {
			"agentRuns.send": agentRun(),
		});
		expect(send.code).toBe(0);
		expect(send.calls[0]!.input).toEqual({ id: agentRunId, text: "CI is red" });
		const interrupt = await runCli(["agents", "send", agentRunId, "--text", "Stop. CI is red", "--interrupt"], {
			"agentRuns.send": agentRun(),
		});
		expect(interrupt.code).toBe(0);
		expect(interrupt.calls[0]!.input).toEqual({ id: agentRunId, text: "Stop. CI is red", interrupt: true });

		const piped = await runCli(
			["agents", "send", agentRunId, "--text", "-"],
			{ "agentRuns.send": agentRun() },
			{ stdin: "the whole review" },
		);
		expect(piped.calls[0]!.input).toEqual({ id: agentRunId, text: "the whole review" });
	});

	// CLI-128: the terminal text goes into a manager's context, so it prints
	// verbatim on a TTY and on a pipe alike.
	test("agents output prints the text and --json wraps it", async () => {
		const text = "$ bun test\n1 pass\n";
		const tty = await runCli(["agents", "output", agentRunId], { "agentRuns.output": { text } }, { tty: true });
		expect(tty.code).toBe(0);
		expect(tty.calls[0]).toMatchObject({ path: "agentRuns.output", input: { id: agentRunId } });
		expect(tty.stdout).toBe(text);

		const piped = await runCli(["agents", "output", agentRunId], { "agentRuns.output": { text } });
		expect(piped.stdout).toBe(text);

		const asJson = await runCli(["agents", "output", agentRunId, "--json"], { "agentRuns.output": { text } });
		expect(JSON.parse(asJson.stdout)).toEqual({ text });
	});
});

test("agents start and resume pass their model overrides", async () => {
	const started = await runCli(
		["agents", "start", personaId, "--ticket", "CDE-42", "--model", "anthropic/claude-sonnet-5"],
		{
			"personas.get": persona(),
			"agentRuns.start": agentRun(),
		},
	);
	expect(started.code).toBe(0);
	expect(started.calls[1]!.input).toEqual({ personaId, ticket: "CDE-42", model: "anthropic/claude-sonnet-5" });
	const resumed = await runCli(
		[
			"agents",
			"resume",
			agentRunId,
			"--model",
			"anthropic/claude-opus-5",
			"--expected-terminal-id",
			"attempt",
			"--request-id",
			"model-switch",
		],
		{ "agentRuns.resume": agentRun() },
	);
	expect(resumed.code).toBe(0);
	expect(resumed.calls[0]!.input).toEqual({
		id: agentRunId,
		model: "anthropic/claude-opus-5",
		expectedTerminalId: "attempt",
		requestId: "model-switch",
	});
});

// A resume answers a row in any state, like a start. Exit code 6 alone left
// the person to read the JSON row for the reason.
test("agents resume exits 6 and names the state and the reason", async () => {
	const result = await runCli(
		["agents", "resume", agentRunId, "--expected-terminal-id", "attempt", "--request-id", "resume-1"],
		{ "agentRuns.resume": agentRun({ state: "failed", error: "the harness has no account for this persona" }) },
	);
	expect(result.code).toBe(6);
	expect(lines(result.stderr)).toEqual(["warning: the agent is failed: the harness has no account for this persona"]);

	const silent = await runCli(
		["agents", "resume", agentRunId, "--expected-terminal-id", "attempt", "--request-id", "resume-2"],
		{ "agentRuns.resume": agentRun({ state: "stopped", error: null }) },
	);
	expect(silent.code).toBe(6);
	expect(lines(silent.stderr)).toEqual(["warning: the agent is stopped: no error text"]);
});

test("agents model changes a running agent", async () => {
	const result = await runCli(
		[
			"agents",
			"model",
			agentRunId,
			"--model",
			"anthropic/claude-opus-5",
			"--expected-terminal-id",
			"attempt",
			"--request-id",
			"switch",
		],
		{ "agentRuns.setModel": agentRun() },
	);
	expect(result.code).toBe(0);
	expect(result.calls[0]!.input).toEqual({
		id: agentRunId,
		model: "anthropic/claude-opus-5",
		expectedTerminalId: "attempt",
		requestId: "switch",
	});
});

test("models list passes a harness filter and prints canonical IDs", async () => {
	const result = await runCli(["models", "list", "--harness", "codex", "--json"], {
		"models.list": [{ id: "openai/gpt-6-astra", name: "GPT-6 Astra" }],
	});
	expect(result.code).toBe(0);
	expect(result.calls[0]).toMatchObject({ path: "models.list", input: { harness: "codex" } });
	expect(JSON.parse(result.stdout)).toEqual([{ id: "openai/gpt-6-astra", name: "GPT-6 Astra" }]);
});
