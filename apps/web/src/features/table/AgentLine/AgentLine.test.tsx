import { describe, expect, test } from "bun:test";
import type { AgentRun } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { agentLineHeight } from "../rowHeights";
import { AgentLine, agentLineOf, agentLinesOf } from "./AgentLine";

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

const asking = () => {
	const run = runOf();
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

const speaking = () => {
	const run = runOf();
	run.observation!.lastMessage = { text: "I rebased onto master.", at };
	return run;
};

// `renderToStaticMarkup` writes the text of each element with no separator,
// so the words of one line run together. The test reads the words, not the
// gaps.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

describe("agentLineOf", () => {
	test("prints the run name, a colon and the last message", () => {
		expect(agentLineOf(speaking())).toEqual({ words: "crisp-fjord: I rebased onto master.", asks: false });
	});

	test("prints the question of the harness and marks the line as a request", () => {
		expect(agentLineOf(asking())).toEqual({ words: "crisp-fjord: asks: Which cap?", asks: true });
	});

	test("prints the title alone when the harness sends no question text", () => {
		const run = runOf();
		run.observation!.attention!.requests = [
			{ id: "elicitation", kind: "elicitation", title: "Project name", blocking: true, sequence: 2, at },
		];

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord: asks: Project name", asks: true });
	});

	test("names the tool of a permission request", () => {
		const run = runOf();
		run.observation!.attention!.requests = [
			{ id: "permission", kind: "permission", title: "Approve Bash", blocking: true, sequence: 2, at },
		];

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord: asks to run: Bash", asks: true });
	});

	test("gives a run that works with no message and no request no line", () => {
		expect(agentLineOf(runOf())).toBeNull();
	});

	test("a request wins over the last message", () => {
		const run = asking();
		run.observation!.lastMessage = { text: "I rebased onto master.", at };

		expect(agentLineOf(run)).toEqual({ words: "crisp-fjord: asks: Which cap?", asks: true });
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
});

describe("AgentLine", () => {
	test("prints the words of a message in the muted color and draws no dot", () => {
		const html = renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={0} />);

		expect(textOf(html)).toContain("crisp-fjord: I rebased.");
		expect(html).toContain("text-fg-muted");
		expect(html).not.toContain("bg-warning");
	});

	test("draws the dot and the warning color when the run asks", () => {
		const html = renderToStaticMarkup(
			<AgentLine line={{ words: "crisp-fjord: asks: Which cap?", asks: true }} top={0} />,
		);

		expect(textOf(html)).toContain("crisp-fjord: asks: Which cap?");
		expect(html).toContain("bg-warning");
		expect(html).toContain("text-warning");
	});

	test("says no label of its own", () => {
		const html = textOf(
			renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={0} />),
		);

		expect(html).not.toContain("said:");
	});

	test("takes the height the virtual list reserves, at the offset it names", () => {
		const html = renderToStaticMarkup(<AgentLine line={{ words: "crisp-fjord: I rebased.", asks: false }} top={288} />);

		expect(html).toContain(`height:${agentLineHeight}px`);
		expect(html).toContain("translateY(288px)");
	});
});
