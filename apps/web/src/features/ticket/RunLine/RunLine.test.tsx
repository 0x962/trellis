import { describe, expect, test } from "bun:test";
import type { AgentRun, TicketMetrics } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import { RunLine } from "./RunLine";

const at = new Date(Date.now() - 3 * 60 * 1000).toISOString();

// A run that works on a ticket. Each test passes only the fields it changes.
const runOf = (fields: Partial<AgentRun> = {}) =>
	({
		id: "run",
		name: "crisp-fjord",
		kind: "agent",
		runtime: "native",
		harness: {
			preset: "claude",
			model: "anthropic/claude-opus-5",
			startCommand: "claude",
			resumeCommand: "claude --resume",
		},
		instruction: "",
		projectId: null,
		projectPath: "",
		ticketId: "ticket-a",
		ticketIdentifier: "TRL-184",
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
			lastTool: { name: "Bash", target: "bun test", status: "running", startedAt: at, updatedAt: at },
			outcome: null,
			turnId: "turn",
			attention: { sequence: 1, requests: [], completion: null, failure: null },
		},
		...fields,
	}) as AgentRun;

const metrics: TicketMetrics = { durationMs: 12 * 60 * 1000, tokenCount: 48120, ageMs: 60 * 60 * 1000 };

// `renderToStaticMarkup` writes the text of each span with no separator, so
// the words of one line run together. A test must not expect a space between
// the text of two spans.
const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

const render = (run: AgentRun | null, ticketMetrics: TicketMetrics | null = metrics) =>
	renderToStaticMarkup(<RunLine run={run} metrics={ticketMetrics} onOpenSession={() => {}} />);

describe("RunLine", () => {
	test("prints the name, the harness, the model, the state words and the time", () => {
		const text = textOf(render(runOf()));

		expect(text).toContain("crisp-fjord");
		expect(text).toContain("Claude");
		expect(text).toContain("Claude Opus 5");
		expect(text).toContain("works, tool Bash");
		expect(text).toContain("3m ago");
	});

	test("prints the last message under the line", () => {
		const run = runOf();
		run.observation!.lastMessage = { text: "I rebased onto master.", at };

		expect(textOf(render(run))).toContain("crisp-fjord: I rebased onto master.");
	});

	test("prints one line while the run says nothing", () => {
		expect(textOf(render(runOf()))).not.toContain(":");
	});

	test("the agent card moves while the run works", () => {
		expect(render(runOf())).toContain("agent-profile-sweep");
	});

	test("the agent card stands still while the run waits for a person", () => {
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
		const html = render(run);

		expect(textOf(html)).toContain("asks: Which cap?");
		expect(html).toContain("The run waits for a person.");
		expect(html).not.toContain("agent-profile-sweep");
	});

	test("a failed run and a lost run take one red dot and two sets of words", () => {
		const failed = render(runOf({ state: "failed", error: "the branch is gone" }));
		const lost = render(runOf({ processStatus: "unknown" }));

		expect(textOf(failed)).toContain("failed: the branch is gone");
		expect(textOf(lost)).toContain("did not run: Trellis cannot find a live execution record");
		expect(failed).toContain("bg-danger");
		expect(lost).toContain("bg-danger");
	});

	test("hides a raw runtime socket error behind details", () => {
		const html = render(runOf({ state: "failed", error: "connect ENOENT /var/folders/example/runtime.sock" }));
		const text = textOf(html);

		expect(text).toContain("did not run: Trellis could not reach the execution service");
		expect(text).toContain("Details");
		expect(html).toContain("connect ENOENT /var/folders/example/runtime.sock");
	});

	test("prints one retry button when a retry action exists", () => {
		const html = renderToStaticMarkup(
			<RunLine
				run={runOf({ state: "failed", error: "connect ENOENT /var/folders/example/runtime.sock" })}
				metrics={metrics}
				retry={{ starting: false, error: null, onRetry: () => {} }}
				onOpenSession={() => {}}
			/>,
		);

		expect(html.split('aria-label="Retry"').length - 1).toBe(1);
	});

	test("opens the session from a control that a screen reader names", () => {
		expect(render(runOf())).toContain('aria-label="Session"');
	});

	test("prints one sentence while no agent holds the ticket", () => {
		expect(textOf(render(null))).toContain("No agent works on this ticket.");
	});
});
