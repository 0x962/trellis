import { describe, expect, test } from "bun:test";
import { agentSession, agentSettings, managerSession, projectSettings } from "../../test/agentFixtures.ts";
import { lines, runCli } from "../../test/deps.ts";
import { project, projectId, projectId2 } from "../../test/fixtures.ts";

describe("agents status", () => {
	test("--project lists the sessions of the project", async () => {
		const sessions = { sessions: [managerSession(), agentSession()] };
		const result = await runCli(
			["agents", "status", "--project", "CDE"],
			{ "agents.sessions": sessions },
			{ tty: true },
		);
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => [call.path, call.input])).toEqual([["agents.sessions", { project: "CDE" }]]);
		const [header, ...rows] = lines(result.stdout);
		expect(header).toContain("title");
		expect(rows.map((row) => row.split(/\s{2,}/)[0])).toEqual(["CDE manager", "CDE-42"]);
		expect(result.stdout).toContain("running");
	});

	test("--ticket lists the sessions of the ticket as the procedure output", async () => {
		const sessions = { sessions: [agentSession()] };
		const result = await runCli(["agents", "status", "--ticket", "CDE-42", "--json"], { "agents.sessions": sessions });
		expect(result.code).toBe(0);
		expect(result.calls[0]!.input).toEqual({ ticket: "CDE-42" });
		expect(JSON.parse(result.stdout)).toEqual(sessions);
	});

	test("without a scope it lists the sessions of every project in the agent settings", async () => {
		const byProject: Record<string, unknown[]> = {
			[projectId]: [managerSession()],
			[projectId2]: [agentSession({ projectId: projectId2, title: "OPS-1" })],
		};
		const result = await runCli(["agents", "status", "--json"], {
			"agents.settings": agentSettings(),
			"agents.sessions": (input: { project: string }) => ({ sessions: byProject[input.project] }),
		});
		expect(result.code).toBe(0);
		expect(result.calls.map((call) => call.path)).toEqual(["agents.settings", "agents.sessions", "agents.sessions"]);
		expect(result.calls.slice(1).map((call) => call.input)).toEqual([{ project: projectId }, { project: projectId2 }]);
		expect(JSON.parse(result.stdout)).toEqual({ sessions: [...byProject[projectId]!, ...byProject[projectId2]!] });
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
