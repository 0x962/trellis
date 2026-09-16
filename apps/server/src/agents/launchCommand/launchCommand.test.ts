import { expect, test } from "bun:test";
import { type AgentRun, DEFAULT_AGENT_RESUME_COMMAND, DEFAULT_AGENT_START_COMMAND } from "@trellis/api";
import { launchCommand, resumeText } from "./launchCommand.ts";

const run: AgentRun = {
	id: "01J9Z0000000000000000000A1",
	name: "Wren",
	runtime: "native",
	personaId: null,
	personaName: "Trellis Manager",
	kind: "builder",
	instruction: "Manage the project.",
	projectId: null,
	projectPath: "TRL",
	ticketId: null,
	ticketIdentifier: null,
	state: "starting",
	processStatus: null,
	observation: null,
	workspaceId: null,
	terminalId: null,
	url: null,
	error: null,
	sessionId: "3f1c9a7e-8b2d-4c6e-9f0a-1b2c3d4e5f60",
	sessionLost: false,
	createdAt: "2026-09-11T10:00:00.000Z",
	updatedAt: "2026-09-11T10:00:00.000Z",
};
const url = "http://127.0.0.1:4521";

test("worker assignments explain CLI discovery and current workspace evidence", () => {
	const launch = launchCommand({
		run: { ...run, kind: "builder" },
		url,
		context: "Project: TRL",
		template: DEFAULT_AGENT_START_COMMAND,
	});
	expect(launch.prompt).toContain("trellis --help");
	expect(launch.prompt).toContain('trellis evidence register "$TRELLIS_RUN_ID" --path');
	expect(launch.prompt).toContain('trellis evidence check "$TRELLIS_RUN_ID" --request-id');
	expect(launch.prompt).toContain("readyForReview");
	expect(launch.prompt).toContain("Follow the project review policy");
});

test("the default start command hands Claude the session id of the run and the whole prompt", () => {
	const launch = launchCommand({ run, url, context: "Project: TRL", template: DEFAULT_AGENT_START_COMMAND });
	expect(launch.command).toContain(
		"claude --dangerously-skip-permissions -n 'Trellis Manager' --session-id '3f1c9a7e-8b2d-4c6e-9f0a-1b2c3d4e5f60' '",
	);
	expect(launch.command).not.toContain("--resume");
	expect(launch.command).toContain("Manage the project.");
	expect(launch.prompt).toContain("Project: TRL");
});

test("the default resume command continues the session with the resume text as its prompt", () => {
	const launch = launchCommand({
		run,
		url,
		context: "Project: TRL",
		directory: "/Users/me/it's here",
		resume: true,
		template: DEFAULT_AGENT_RESUME_COMMAND,
	});
	expect(launch.command).toStartWith("cd '/Users/me/it'\\''s here' && exec env ");
	expect(launch.command).toContain(
		"claude --dangerously-skip-permissions -n 'Trellis Manager' --resume '3f1c9a7e-8b2d-4c6e-9f0a-1b2c3d4e5f60' '",
	);
	expect(launch.command).toEndWith(`'${run.instruction}\n\n${resumeText}'`);
	expect(launch.command).not.toContain("--session-id");
	expect(launch.command).toContain("Manage the project.");
});

test("a project's own agent command runs in place of Claude, with each value as one argument", () => {
	const launch = launchCommand({
		run,
		url,
		context: "Project: TRL",
		template: "codex --session {{sessionId}} --cd {{directory}} {{prompt}}",
		directory: "/srv/trl",
	});
	expect(launch.command).toStartWith("cd '/srv/trl' && exec env TRELLIS_URL='http://127.0.0.1:4521' TRELLIS_ACTOR=");
	expect(launch.command).toContain("codex --session '3f1c9a7e-8b2d-4c6e-9f0a-1b2c3d4e5f60' --cd '/srv/trl' '");
	expect(launch.command).not.toContain("claude");
});

test("initial and resumed prompts identify the runtime message", () => {
	for (const template of [DEFAULT_AGENT_START_COMMAND, DEFAULT_AGENT_RESUME_COMMAND]) {
		const launch = launchCommand({ run, url, context: "Project: TRL", template, messageId: "attempt-123" });
		expect(launch.command).toContain("trellis-message:attempt-123\nManage the project.");
	}
});

test("manager assignment messages contain only identity and context facts", () => {
	const instruction = `Database persona ${crypto.randomUUID()}`;
	const { prompt } = launchCommand({
		run: { ...run, kind: "manager", instruction },
		url,
		context: "Project: TRL",
		template: DEFAULT_AGENT_START_COMMAND,
	});
	expect(JSON.parse(prompt)).toEqual({
		agent: { id: run.id, name: run.personaName },
		actor: `agent:${run.id}`,
		trellisUrl: url,
		persona: { id: run.personaId, name: run.personaName },
		context: "Project: TRL",
	});
	expect(prompt).not.toContain(instruction);
});

test("manager resume messages contain restart facts without behavioral instructions", () => {
	const instruction = `Database persona ${crypto.randomUUID()}`;
	const launch = launchCommand({
		run: { ...run, kind: "manager", instruction },
		url,
		context: "Project: TRL",
		template: "agent {{resumeText}}",
		messageId: "resume-id",
	});
	expect(launch.command).toContain(
		`trellis-message:resume-id\n{"event":"session.resumed","actor":"agent:${run.id}","project":"TRL"}`,
	);
	expect(launch.command).not.toContain(instruction);
	expect(launch.command).not.toContain(resumeText);
});

test("the persona labels the agent while its actor retains the assignment ID", () => {
	const launch = launchCommand({ run, url, context: "Project: TRL", template: DEFAULT_AGENT_START_COMMAND });
	expect(launch.prompt).not.toContain("Wren");
	expect(launch.prompt).toContain("Your persona is Trellis Manager.");
	expect(launch.prompt).toContain(`Your Trellis actor is agent:${run.id}`);
});
