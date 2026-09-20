import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { agentLineOf, agentLinesOf } from "./agentLines";

const at = "2026-09-18T12:00:00.000Z";

// A run that works, with no message and no open request. Each test adds the
// one field it reads.
const runOf = (fields: Partial<AgentRun> = {}) =>
	({
		id: "run",
		name: "crisp-fjord",
		kind: "agent",
		runtime: "native",
		harness: null,
		instruction: "",
		projectId: null,
		projectPath: "",
		ticketId: "ticket-a",
		ticketIdentifier: "OP-32",
		ticketTitle: null,
		ticketStatusCategory: null,
		assigned: true,
		state: "running",
		processStatus: "running",
		workspaceId: null,
		terminalId: "attempt",
		url: null,
		error: null,
		sessionId: "conversation",
		sessionLost: false,
		createdAt: at,
		updatedAt: at,
		observation: {
			checkedAt: at,
			controllable: true,
			activity: { state: "working", updatedAt: at },
			lastMessage: null,
			lastTool: null,
			outcome: null,
			turnId: "turn",
			attention: { sequence: 1, requests: [], completion: null, failure: null },
		},
		...fields,
	}) as AgentRun;

const asking = (name = "crisp-fjord") => {
	const run = runOf({ name });
	run.observation!.attention!.requests = [
		{
			id: "question",
			kind: "question",
			title: "The agent has a question",
			blocking: true,
			questions: [{ id: "0", question: "Which cap?", options: [], multiple: false }],
			sequence: 2,
			at,
		},
	];
	return run;
};

const speaking = (name = "crisp-fjord") => {
	const run = runOf({ name });
	run.observation!.lastMessage = { text: "I rebased onto master.", at };
	return run;
};

describe("agentLineOf", () => {
	test("prints the run name, a colon and the last message", () => {
		expect(agentLineOf(speaking())).toEqual({ words: "crisp-fjord: I rebased onto master.", asks: false });
	});

	test("prints the question of the harness and marks the line as a request", () => {
		expect(agentLineOf(asking())).toEqual({ words: "crisp-fjord asks: Which cap?", asks: true });
	});

	test("prints the title alone when the harness sends no question text", () => {
		const run = runOf();
		run.observation!.attention!.requests = [
			{ id: "elicitation", kind: "elicitation", title: "Project name", blocking: true, sequence: 2, at },
		];

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord asks: Project name", asks: true });
	});

	test("names the tool of a permission request", () => {
		const run = runOf();
		run.observation!.attention!.requests = [
			{ id: "permission", kind: "permission", title: "Approve Bash", blocking: true, sequence: 2, at },
		];

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord asks to run: Bash", asks: true });
	});

	test("writes one colon in each form of the line", () => {
		const asked = agentLineOf(asking())!;
		const said = agentLineOf(speaking())!;

		expect(asked.words).toBe("crisp-fjord asks: Which cap?");
		expect(said.words).toBe("crisp-fjord: I rebased onto master.");
		expect(asked.words.split(":").length - 1).toBe(1);
		expect(said.words.split(":").length - 1).toBe(1);
	});

	test("gives a run that works with no message and no request no line", () => {
		expect(agentLineOf(runOf())).toBeNull();
	});

	test("a request wins over the last message", () => {
		const run = asking();
		run.observation!.lastMessage = { text: "I rebased onto master.", at };

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord asks: Which cap?", asks: true });
	});

	test("keeps the message of a run that stopped", () => {
		const run = speaking();
		run.state = "stopped";

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord: I rebased onto master.", asks: false });
	});
});

describe("agentLinesOf", () => {
	test("keys each line by the ticket of its run", () => {
		expect(agentLinesOf([speaking()])).toEqual(
			new Map([["ticket-a", { words: "crisp-fjord: I rebased onto master.", asks: false }]]),
		);
	});

	test("leaves out a run of another kind", () => {
		const flow = speaking();
		flow.kind = "flow";

		expect(agentLinesOf([flow]).size).toBe(0);
	});

	test("leaves out a run that holds no ticket", () => {
		const loose = speaking();
		loose.ticketId = null;

		expect(agentLinesOf([loose]).size).toBe(0);
	});

	test("leaves out a run with nothing to say", () => {
		expect(agentLinesOf([runOf()]).size).toBe(0);
	});

	test("keeps the request of one run when a later run of the same ticket only speaks", () => {
		const lines = agentLinesOf([asking("amber-quarry"), speaking()]);

		expect(lines.get("ticket-a")).toEqual({ words: "amber-quarry asks: Which cap?", asks: true });
	});

	test("takes the request of a later run of the same ticket", () => {
		const lines = agentLinesOf([speaking(), asking("amber-quarry")]);

		expect(lines.get("ticket-a")).toEqual({ words: "amber-quarry asks: Which cap?", asks: true });
	});

	test("takes the later message when neither run of a ticket asks", () => {
		const second = speaking("amber-quarry");
		second.observation!.lastMessage = { text: "The tests pass.", at };

		expect(agentLinesOf([speaking(), second]).get("ticket-a")).toEqual({
			words: "amber-quarry: The tests pass.",
			asks: false,
		});
	});
});
