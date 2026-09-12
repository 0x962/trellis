import { expect, test } from "bun:test";
import { type AgentRun, DEFAULT_AGENT_RESUME_COMMAND, DEFAULT_AGENT_START_COMMAND } from "@trellis/api";
import { launchCommand, resumeText } from "./launchCommand.ts";

const run: AgentRun = {
	id: "01J9Z0000000000000000000A1",
	name: "Wren",
	runtime: "superset",
	personaId: null,
	personaName: "Trellis Manager",
	kind: "manager",
	instruction: "Manage the project.",
	projectId: null,
	projectPath: "TRL",
	ticketId: null,
	ticketIdentifier: null,
	state: "starting",
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

test("the default start command hands Claude the session id of the run and the whole prompt", () => {
	const launch = launchCommand({ run, url, context: "Project: TRL", template: DEFAULT_AGENT_START_COMMAND });
	expect(launch.command).toContain("claude -n 'Wren' --session-id '3f1c9a7e-8b2d-4c6e-9f0a-1b2c3d4e5f60' '");
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
	expect(launch.command).toContain("claude -n 'Wren' --resume '3f1c9a7e-8b2d-4c6e-9f0a-1b2c3d4e5f60' '");
	expect(launch.command).toEndWith(`'${resumeText}'`);
	expect(launch.command).not.toContain("--session-id");
	expect(launch.command).not.toContain("Manage the project.");
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
