import { afterEach, beforeEach, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { AgentPing, AgentSession, Project, TrellisEvent } from "@trellis/api";
import type { AgentsHost } from "../../src/agents/host.ts";
import type { InlineTransport } from "../../src/db/transport.ts";
import { createTestApp, type TestApp } from "./app.ts";
import { type FakeTimerClock, fakeTimerClock } from "./clock.ts";
import { type SupersetStubHandle, supersetStub } from "./superset-stub.ts";

// The hooks a test file of the agents host shares. Each test gets its own
// app, fake superset, and fake clock, so no test waits in real time and no
// test sees the rows of another. The project is always CDE, with the repo
// acme/web, which matches the one Superset project the fake knows.

export const MANAGER_ACTOR = "agent:manager-cde";

export const agentsHostHarness = () => {
	let t: TestApp;
	let stub: SupersetStubHandle;
	let clock: FakeTimerClock;
	let host: AgentsHost;
	let logs: string[];
	const events: TrellisEvent[] = [];

	beforeEach(async () => {
		stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
			projects: [{ id: "sp-web", name: "web", repo: "acme/web", path: "/src/web" }],
		});
		t = await createTestApp({ supersetBin: stub.bin });
		clock = fakeTimerClock(new Date("2026-09-10T12:00:00.000Z"));
		logs = [];
		events.length = 0;
		t.bus.subscribe(({ event }) => void events.push(event));
	});
	afterEach(async () => {
		host.stop();
		await t.close();
		stub.restore();
	});

	// `global` false leaves the global agent switch off. `heartbeatSeconds`
	// null turns the project's heartbeat off.
	const settingsFor = (project: Project, global: boolean, heartbeatSeconds: number | null) => ({
		runner: "superset",
		enabled: global,
		projects: [
			{
				projectId: project.id,
				enabled: true,
				supersetProjectId: null,
				baseBranch: "main",
				maxConcurrent: 3,
				removeWorkspaceOnDone: true,
				heartbeatSeconds,
			},
		],
	});

	return {
		get t() {
			return t;
		},
		get stub() {
			return stub;
		},
		get clock() {
			return clock;
		},
		get host() {
			return host;
		},
		get logs() {
			return logs;
		},
		events,

		startHost: async () => {
			host = (t.transport as InlineTransport).startAgents({ clock, log: (msg) => void logs.push(msg) });
			await host.start();
			return host;
		},

		// Seeds CDE with the repo acme/web and writes the agent settings.
		enable: async (global = true, heartbeatSeconds: number | null = null) => {
			const project = await t.seedProject();
			await t.api("/api/projects/CDE/repos", { method: "PUT", body: { repos: [{ owner: "acme", repo: "web" }] } });
			const put = await t.api("/api/agents/settings", {
				method: "PUT",
				body: settingsFor(project, global, heartbeatSeconds),
			});
			expect(put.status).toBe(200);
			return project;
		},

		setSettings: (project: Project, global: boolean, heartbeatSeconds: number | null) =>
			t.api("/api/agents/settings", { method: "PUT", body: settingsFor(project, global, heartbeatSeconds) }),

		// The sessions `query` selects, such as "project=CDE" or "ticket=CDE-1".
		sessions: async (query = "project=CDE"): Promise<AgentSession[]> =>
			(await t.api(`/api/agents/sessions?${query}`, { actor: null })).body.sessions,

		pings: async (): Promise<AgentPing[]> => (await t.api("/api/agents/pings?project=CDE", { actor: null })).body.pings,

		// Every text the fake superset typed into a terminal, in order.
		sent: () => stub.state().terminals.flatMap((terminal) => terminal.sent),

		// Registers the manager tab of `session` under `claudeSessionId`, so a
		// wake of an exited manager resumes that Claude session.
		registerManager: async (session: AgentSession, claudeSessionId: string) => {
			const body = {
				role: "manager",
				project: "CDE",
				workspaceId: session.workspaceId,
				terminalId: session.terminalId,
				claudeSessionId,
			};
			const response = await t.api("/api/agents/register", { method: "POST", body, actor: MANAGER_ACTOR });
			expect(response.status).toBe(200);
		},
	};
};
