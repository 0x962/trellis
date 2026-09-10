import { afterAll, afterEach, beforeAll, beforeEach, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { AgentSession, AgentSettingsSetInput, Project, TrellisEvent } from "@trellis/api";
import { createTestApp, type TestApp } from "./app.ts";
import { freshDb, type TestDb } from "./db.ts";
import { type SupersetStubHandle, supersetStub } from "./superset-stub.ts";

// The hooks an agents contract test file shares. Each test gets an empty
// database, a fake superset with one Superset project for the repo
// acme/web, one manager workspace with a live "CDE manager" tab, an app
// whose runner spawns that fake, and the list of events the bus carried.

export const MANAGER = "agent:manager-cde";

export const MANAGER_TAB = { workspaceId: "ws-m", terminalId: "t-m" };

export type ProjectAgentOverrides = Partial<AgentSettingsSetInput["projects"][number]>;

export const agentsHarness = () => {
	let h: TestDb;
	let t: TestApp;
	let stub: SupersetStubHandle;
	const events: TrellisEvent[] = [];

	beforeAll(async () => {
		h = await freshDb();
	});
	beforeEach(async () => {
		await h.reset();
		stub = supersetStub(mkdtempSync(join(process.env.TRELLIS_HOME!, "superset-")), {
			projects: [{ id: "sp-web", name: "web", repo: "acme/web", path: "/src/web" }],
			workspaces: [
				{ id: "ws-m", name: "CDE · manager", branch: "trellis-cde-manager", projectId: "sp-web", baseBranch: "main", tag: "trellis-cde" },
			],
			terminals: [
				{ terminalId: "t-m", workspaceId: "ws-m", label: "Terminal", title: "CDE manager", command: null, exited: false, sent: [] },
			],
		});
		t = await createTestApp({ db: h, supersetBin: stub.bin });
		events.length = 0;
		t.bus.subscribe(({ event }) => void events.push(event));
	});
	afterEach(async () => {
		await t.close();
		stub.restore();
	});
	afterAll(() => h.close());

	// Seeds CDE with the repo acme/web and turns agents on for it. `global`
	// false leaves the global switch off.
	const enable = async (overrides: ProjectAgentOverrides = {}, global = true): Promise<Project> => {
		const project = await t.seedProject();
		const repos = await t.api("/api/projects/CDE/repos", {
			method: "PUT",
			body: { repos: [{ owner: "acme", repo: "web" }] },
		});
		expect(repos.status).toBe(200);
		const row = {
			projectId: project.id,
			enabled: true,
			supersetProjectId: null,
			baseBranch: "main",
			maxConcurrent: 3,
			removeWorkspaceOnDone: true,
			...overrides,
		};
		const put = await t.api("/api/agents/settings", {
			method: "PUT",
			body: { runner: "superset", enabled: global, projects: [row] },
		});
		expect(put.status).toBe(200);
		return project;
	};

	// Registers the manager tab of the fake as CDE's manager.
	const registerManager = async (claudeSessionId = "claude-1"): Promise<AgentSession> => {
		const body = { role: "manager", project: "CDE", ...MANAGER_TAB, claudeSessionId };
		const response = await t.api("/api/agents/register", { method: "POST", body, actor: MANAGER });
		expect(response.status).toBe(200);
		return response.body as AgentSession;
	};

	// Starts a builder for `ticket` and returns its session.
	const startBuilder = async (ticket: string): Promise<AgentSession> => {
		const response = await t.api("/api/agents/builder", { method: "POST", body: { ticket }, actor: MANAGER });
		expect(response.status).toBe(200);
		return response.body as AgentSession;
	};

	const sessionEvents = () =>
		events.flatMap((event) => (event.type === "agents.session" ? [event.session] : []));

	return {
		get t() {
			return t;
		},
		get stub() {
			return stub;
		},
		get db() {
			return h.db;
		},
		// The database of the harness, for a second app on the same rows.
		get testDb() {
			return h;
		},
		events,
		enable,
		registerManager,
		startBuilder,
		sessionEvents,
	};
};
