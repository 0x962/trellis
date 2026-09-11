import { describe, expect, test } from "bun:test";
import {
	agentSession,
	agentSettings,
	agentsOverview,
	managerSession,
	projectSettings,
} from "../../test/agentFixtures.ts";
import { lines, runCli } from "../../test/deps.ts";
import { project, projectId2 } from "../../test/fixtures.ts";

describe("agents status", () => {
	test("--project lists the sessions of the project, the person name first", async () => {
		const sessions = { sessions: [managerSession(), agentSession()] };
		const result = await runCli(
			["agents", "status", "--project", "CDE"],
			{ "agents.sessions": sessions },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => [call.path, call.input])).toEqual([["agents.sessions", { project: "CDE" }]]);
		const [header, ...rows] = lines(result.stdout);
		expect(header).toContain("name");
		expect(header).toContain("title");
		expect(rows.map((row) => row.split(/\s{2,}/)[0])).toEqual(["Amara", "Kenji"]);
		expect(result.stdout).toContain("CDE manager");
		expect(result.stdout).toContain("running");
	});

	test("--ticket lists the sessions of the ticket as the procedure output", async () => {
		const sessions = { sessions: [agentSession()] };
		const result = await runCli(["agents", "status", "--ticket", "CDE-42", "--json"], { "agents.sessions": sessions });
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42" });
		expect(JSON.parse(result.stdout)).toEqual(sessions);
	});

	// The Activity page in the web reads the same overview.
	test("without a scope it prints the overview as the procedure output", async () => {
		const result = await runCli(["agents", "status", "--json"], { "agents.overview": agentsOverview() });
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["agents.overview"]);
		expect(JSON.parse(result.stdout)).toEqual(agentsOverview());
	});

	test("without a scope on a TTY it prints the sessions with their errors, the agent actions, and the batches", async () => {
		const result = await runCli(["agents", "status"], { "agents.overview": agentsOverview() }, { tty: true });
		expect(result.code).toBe(0);
		for (const fragment of [
			"sessions (2)",
			"CDE manager",
			"failed",
			"superset ws create: fatal: invalid reference: main",
			"actions (1)",
			"CDE-42",
			"agent:manager-cde",
			"batches (1)",
			"trellis: 2 changes in CDE",
		]) {
			expect(result.stdout, fragment).toContain(fragment);
		}
	});

	test("--project and --ticket together exit 2 and send nothing", async () => {
		const result = await runCli(["agents", "status", "--project", "CDE", "--ticket", "CDE-42"]);
		expect(result.code).toBe(2);
		expect(lines(result.stderr)).toHaveLength(1);
		expect(result.stderr).toContain("--project");
		expect(result.stderr).toContain("--ticket");
		expect(result.calls).toEqual([]);
	});
});

describe("agents on and off", () => {
	test("off without a project turns the global switch off and keeps every project row", async () => {
		const result = await runCli(["agents", "off", "--json"], {
			"agents.settings": agentSettings(),
			"agents.setSettings": (input: unknown) => input,
		});
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["agents.settings", "agents.setSettings"]);
		expect(result.calls[1]!.input).toEqual(agentSettings({ enabled: false }));
		expect(JSON.parse(result.stdout)).toEqual(agentSettings({ enabled: false }));
	});

	test("on --project turns on the row of that project and leaves the global switch", async () => {
		const settings = agentSettings({ enabled: false });
		const result = await runCli(["agents", "on", "--project", "OPS"], {
			"agents.settings": settings,
			"projects.get": project({ id: projectId2, key: "OPS" }),
			"agents.setSettings": (input: unknown) => input,
		});
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["agents.settings", "projects.get", "agents.setSettings"]);
		expect(result.calls[1]!.input).toEqual({ project: "OPS" });
		expect(result.calls[2]!.input).toEqual({
			...settings,
			projects: [projectSettings(), projectSettings({ projectId: projectId2, enabled: true })],
		});
	});

	test("off --project adds a default row for a project without one", async () => {
		const settings = agentSettings({ projects: [] });
		const result = await runCli(["agents", "off", "--project", "CDE"], {
			"agents.settings": settings,
			"projects.get": project(),
			"agents.setSettings": (input: unknown) => input,
		});
		expect(result.code).toBe(0);
		expect(result.calls[2]!.input).toEqual({ ...settings, projects: [projectSettings({ enabled: false })] });
	});

	// The verb replaces the whole document, so a host somebody picked in the
	// web survives a switch the CLI flips.
	test("a project row keeps its Superset host through the toggle, and a new row names none", async () => {
		const settings = agentSettings({
			projects: [projectSettings({ supersetHostId: "04705517c8ad3a6d7f595f395125ecfe" })],
		});
		const result = await runCli(["agents", "off", "--project", "OPS"], {
			"agents.settings": settings,
			"projects.get": project({ id: projectId2, key: "OPS" }),
			"agents.setSettings": (input: unknown) => input,
		});
		expect(result.code).toBe(0);
		const written = result.calls[2]!.input as { projects: Array<Record<string, unknown>> };
		expect(written.projects[0]!.supersetHostId).toBe("04705517c8ad3a6d7f595f395125ecfe");
		expect(written.projects[1]).toEqual(
			projectSettings({ projectId: projectId2, enabled: false }) as Record<string, unknown>,
		);
		expect(written.projects[1]!.supersetHostId).toBeNull();
	});

	test("on a TTY it prints the switch it changed", async () => {
		const result = await runCli(
			["agents", "on"],
			{ "agents.settings": agentSettings({ enabled: false }), "agents.setSettings": (input: unknown) => input },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("enabled");
		expect(result.stdout).toContain("on");
	});
});
